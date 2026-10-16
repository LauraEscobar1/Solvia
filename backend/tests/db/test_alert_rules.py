import asyncio
import uuid
from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import httpx2
import pytest
import time_machine
from fastapi import FastAPI
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.jobs.alerts import ALERTS_JOB_ID, AlertJob, start_alert_scheduler
from app.models import Alert, Area, ServiceRequest, User
from app.models.enums import (
    AlertSeverity,
    AlertSource,
    AlertType,
    RequestPriority,
    RequestStatus,
    UserRole,
)
from app.repositories.alert import EVALUATION_LOCK_KEY
from app.services.alerts import AlertEvaluator, EvaluationReport, alert_key
from tests.db.conftest import Factory

TZ = ZoneInfo("America/Bogota")
T0 = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)
HIGH_HOURS = (8, 24, 72)
MEDIUM_HOURS = (24, 48, 120)
HIGH_RECEIVED_INACTIVITY = 4
MEDIUM_RECEIVED_INACTIVITY = 12


@dataclass
class Setup:
    support: Area
    admin: User
    supervisor: User
    assignee: User
    requester: User


@pytest.fixture
async def setup(factory: Factory) -> Setup:
    support = await factory.area("Soporte")
    await factory.sla_matrix(
        {RequestPriority.HIGH: HIGH_HOURS, RequestPriority.MEDIUM: MEDIUM_HOURS}
    )
    return Setup(
        support=support,
        admin=await factory.user(UserRole.ADMIN),
        supervisor=await factory.user(UserRole.SUPERVISOR, area=support),
        assignee=await factory.user(UserRole.ASSIGNEE, area=support),
        requester=await factory.user(UserRole.REQUESTER),
    )


@pytest.fixture
def frozen() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(T0, tick=False) as traveller:
        yield traveller


async def _evaluate(session: AsyncSession) -> EvaluationReport:
    return await AlertEvaluator(session).evaluate_all(TZ)


async def _alerts(
    session: AsyncSession, request: ServiceRequest, alert_type: AlertType
) -> list[Alert]:
    rows = await session.scalars(
        select(Alert)
        .where(Alert.request_id == request.id, Alert.type == alert_type)
        .order_by(Alert.created_at)
        .execution_options(populate_existing=True)
    )
    return list(rows)


def _open(alerts: list[Alert]) -> list[Alert]:
    return [alert for alert in alerts if alert.resolved_at is None]


async def test_due_soon_starts_at_exactly_75_percent_of_the_window(
    session: AsyncSession,
    factory: Factory,
    setup: Setup,
    frozen: time_machine.Traveller,
) -> None:
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=T0,
        due_at=T0 + timedelta(hours=40),
    )

    frozen.move_to(T0 + timedelta(hours=30) - timedelta(seconds=1))
    await _evaluate(session)
    before = await _alerts(session, request, AlertType.DUE_SOON)
    frozen.move_to(T0 + timedelta(hours=30))
    await _evaluate(session)
    at_threshold = await _alerts(session, request, AlertType.DUE_SOON)

    assert before == []
    assert len(at_threshold) == 1
    alert = at_threshold[0]
    assert alert.severity is AlertSeverity.WARNING
    assert alert.message_code == "alert.due_soon"
    assert alert.params == {"code": request.code, "due_at": (T0 + timedelta(hours=40)).isoformat()}
    assert alert.area_id == setup.support.id


async def test_overdue_starts_at_due_at_and_resolves_due_soon(
    session: AsyncSession,
    factory: Factory,
    setup: Setup,
    frozen: time_machine.Traveller,
) -> None:
    due_at = T0 + timedelta(hours=40)
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=T0,
        due_at=due_at,
    )

    frozen.move_to(due_at - timedelta(seconds=1))
    await _evaluate(session)
    overdue_before = await _alerts(session, request, AlertType.OVERDUE)
    frozen.move_to(due_at)
    await _evaluate(session)

    assert overdue_before == []
    overdue = await _alerts(session, request, AlertType.OVERDUE)
    due_soon = await _alerts(session, request, AlertType.DUE_SOON)
    assert [alert.severity for alert in _open(overdue)] == [AlertSeverity.CRITICAL]
    assert len(due_soon) == 1
    assert due_soon[0].resolved_at == due_at


@pytest.mark.parametrize(
    ("priority", "threshold", "severity"),
    [
        (RequestPriority.HIGH, HIGH_RECEIVED_INACTIVITY, AlertSeverity.CRITICAL),
        (RequestPriority.MEDIUM, MEDIUM_RECEIVED_INACTIVITY, AlertSeverity.WARNING),
    ],
)
async def test_stalled_starts_after_the_inactivity_threshold(
    session: AsyncSession,
    factory: Factory,
    setup: Setup,
    frozen: time_machine.Traveller,
    priority: RequestPriority,
    threshold: int,
    severity: AlertSeverity,
) -> None:
    request = await factory.request(
        area=setup.support, requester=setup.requester, priority=priority, received_at=T0
    )

    frozen.move_to(T0 + timedelta(hours=threshold))
    await _evaluate(session)
    at_threshold = await _alerts(session, request, AlertType.STALLED)
    frozen.move_to(T0 + timedelta(hours=threshold, seconds=1))
    await _evaluate(session)
    after = await _alerts(session, request, AlertType.STALLED)

    assert at_threshold == []
    assert len(after) == 1
    assert after[0].severity is severity
    assert after[0].params == {
        "code": request.code,
        "status": "received",
        "idle_since": T0.isoformat(),
        "threshold_hours": threshold,
    }


async def test_repeated_runs_do_not_duplicate_alerts(
    session: AsyncSession,
    factory: Factory,
    setup: Setup,
    frozen: time_machine.Traveller,
) -> None:
    for index in range(3):
        await factory.request(
            area=setup.support,
            requester=setup.requester,
            priority=RequestPriority.HIGH,
            received_at=T0 - timedelta(days=5 + index),
            due_at=T0 - timedelta(days=1),
        )

    first = await _evaluate(session)
    second = await _evaluate(session)
    frozen.shift(timedelta(minutes=15))
    third = await _evaluate(session)

    request_alerts = list(await session.scalars(select(Alert).where(Alert.request_id.is_not(None))))
    assert len(request_alerts) == 6
    assert first.created == len(request_alerts) + first.bottlenecks
    assert (second.created, second.updated, second.resolved) == (0, 0, 0)
    assert (third.created, third.resolved) == (0, 0)
    assert third.updated == third.bottlenecks
    keys = {(alert.request_id, alert.type) for alert in request_alerts}
    assert len(keys) == len(request_alerts)


async def test_database_rejects_two_open_alerts_for_the_same_target(
    session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    request = await factory.request(area=setup.support, requester=setup.requester)
    request_id, area_id = request.id, setup.support.id

    def alert(**overrides: Any) -> Alert:
        values: dict[str, Any] = {
            "request_id": request_id,
            "area_id": area_id,
            "type": AlertType.OVERDUE,
            "severity": AlertSeverity.CRITICAL,
            "source": AlertSource.RULE,
            "message_code": "alert.overdue",
            "params": {},
        }
        return Alert(**(values | overrides))

    session.add_all([alert(resolved_at=utcnow()), alert()])
    await session.commit()
    session.add(alert())
    with pytest.raises(IntegrityError):
        await session.commit()
    await session.rollback()

    bottleneck = {
        "request_id": None,
        "type": AlertType.BOTTLENECK,
        "message_code": "alert.bottleneck",
        "params": {"status": "received"},
    }
    session.add_all(
        [alert(**bottleneck), alert(**(bottleneck | {"params": {"status": "assigned"}}))]
    )
    await session.commit()
    session.add(alert(**bottleneck))
    with pytest.raises(IntegrityError):
        await session.commit()


@dataclass
class Scenario:
    name: str
    actor: str
    status: RequestStatus
    body: dict[str, Any]


SCENARIOS = [
    Scenario(
        "avanza",
        "assignee",
        RequestStatus.ASSIGNED,
        {"to": "in_progress", "version": 1},
    ),
    Scenario(
        "completa",
        "assignee",
        RequestStatus.IN_PROGRESS,
        {"to": "completed", "version": 1},
    ),
    Scenario(
        "cancela",
        "supervisor",
        RequestStatus.RECEIVED,
        {"to": "cancelled", "version": 1, "comment": "Duplicada"},
    ),
]


@pytest.mark.parametrize("scenario", SCENARIOS, ids=[scenario.name for scenario in SCENARIOS])
async def test_transitions_resolve_alerts_immediately(
    db_client: httpx2.AsyncClient,
    session: AsyncSession,
    factory: Factory,
    setup: Setup,
    scenario: Scenario,
) -> None:
    now = utcnow()
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        status=scenario.status,
        assignee=setup.assignee if scenario.status is not RequestStatus.RECEIVED else None,
        priority=RequestPriority.HIGH,
        received_at=now - timedelta(days=10),
        due_at=now - timedelta(days=1),
    )
    await _evaluate(session)
    assert len(_open(await _alerts(session, request, AlertType.STALLED))) == 1

    response = await db_client.post(
        f"/api/v1/requests/{request.id}/transition",
        headers=factory.auth_headers(getattr(setup, scenario.actor)),
        json=scenario.body,
    )

    assert response.status_code == 200, response.text
    assert _open(await _alerts(session, request, AlertType.STALLED)) == []
    overdue_open = _open(await _alerts(session, request, AlertType.OVERDUE))
    assert len(overdue_open) == (0 if scenario.name != "avanza" else 1)


async def test_changes_and_comments_reevaluate_without_waiting_for_the_job(
    db_client: httpx2.AsyncClient, session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    now = utcnow()
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=now - timedelta(days=1),
        due_at=now + timedelta(days=3),
    )
    headers = factory.auth_headers(setup.admin)

    patched = await db_client.patch(
        f"/api/v1/requests/{request.id}",
        headers=headers,
        json={"version": 1, "due_at": (now - timedelta(minutes=5)).isoformat()},
    )
    overdue = _open(await _alerts(session, request, AlertType.OVERDUE))
    await session.execute(
        text("UPDATE requests SET last_activity_at = :moment WHERE id = :id"),
        {"moment": now - timedelta(hours=10), "id": request.id},
    )
    await session.commit()
    await _evaluate(session)
    stalled_before = _open(await _alerts(session, request, AlertType.STALLED))
    commented = await db_client.post(
        f"/api/v1/requests/{request.id}/comments", headers=headers, json={"comment": "Revisando"}
    )

    assert patched.status_code == 200, patched.text
    assert len(overdue) == 1
    assert len(stalled_before) == 1
    assert commented.status_code == 201
    assert _open(await _alerts(session, request, AlertType.STALLED)) == []


async def test_failed_reevaluation_still_saves_the_transition(
    db_client: httpx2.AsyncClient,
    session: AsyncSession,
    factory: Factory,
    setup: Setup,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    now = utcnow()
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        status=RequestStatus.IN_PROGRESS,
        assignee=setup.assignee,
        priority=RequestPriority.HIGH,
        received_at=now - timedelta(days=10),
        due_at=now - timedelta(days=1),
    )
    await _evaluate(session)

    async def broken(self: AlertEvaluator, request_id: uuid.UUID) -> EvaluationReport:
        await self._session.execute(text("SELECT 1 / 0"))
        return EvaluationReport()

    monkeypatch.setattr(AlertEvaluator, "evaluate_request", broken)
    response = await db_client.post(
        f"/api/v1/requests/{request.id}/transition",
        headers=factory.auth_headers(setup.assignee),
        json={"to": "completed", "version": 1},
    )
    monkeypatch.undo()

    assert response.status_code == 200, response.text
    assert response.json()["status"] == "completed"
    stored = await session.get(ServiceRequest, request.id, populate_existing=True)
    assert stored is not None
    assert stored.status is RequestStatus.COMPLETED
    assert any("alert_reevaluation_failed" in str(record.msg) for record in caplog.records)
    assert len(_open(await _alerts(session, request, AlertType.OVERDUE))) == 1

    report = await _evaluate(session)

    assert report.resolved >= 1
    assert _open(await _alerts(session, request, AlertType.OVERDUE)) == []


async def test_advisory_lock_skips_a_run_while_another_one_holds_it(
    db_app: FastAPI, session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    now = utcnow()
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        received_at=now - timedelta(days=10),
        due_at=now - timedelta(days=1),
    )
    session_factory = db_app.state.container.session_factory

    async with session_factory() as holder:
        await holder.execute(
            text("SELECT pg_advisory_xact_lock(:key)"), {"key": EVALUATION_LOCK_KEY}
        )
        async with session_factory() as other:
            blocked = await AlertEvaluator(other).evaluate_all(TZ)
        await holder.rollback()
    async with session_factory() as other:
        released = await AlertEvaluator(other).evaluate_all(TZ)

    assert blocked.skipped is True
    assert blocked.created == 0
    assert released.skipped is False
    assert released.created > 0


async def test_simultaneous_runs_do_not_process_twice(
    db_app: FastAPI, session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    now = utcnow()
    for index in range(5):
        await factory.request(
            area=setup.support,
            requester=setup.requester,
            priority=RequestPriority.HIGH,
            received_at=now - timedelta(days=10 + index),
            due_at=now - timedelta(days=1),
        )
    session_factory = db_app.state.container.session_factory

    async def run() -> EvaluationReport:
        async with session_factory() as own:
            return await AlertEvaluator(own).evaluate_all(TZ)

    reports = await asyncio.gather(run(), run())

    alerts = list(await session.scalars(select(Alert)))
    request_alerts = [alert for alert in alerts if alert.request_id is not None]
    assert len(request_alerts) == 10
    assert sum(report.created for report in reports) == len(alerts)
    keys = {
        alert_key(alert.type, alert.request_id, alert.area_id, alert.params) for alert in alerts
    }
    assert len(keys) == len(alerts)


async def test_job_logs_failures_and_keeps_running(
    db_app: FastAPI, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    async def failing(self: AlertEvaluator, timezone: ZoneInfo) -> EvaluationReport:
        raise RuntimeError(timezone.key)

    monkeypatch.setattr(AlertEvaluator, "evaluate_all", failing)
    job = AlertJob(db_app.state.container.session_factory, TZ)

    assert await job.run() is None
    assert any("alerts_evaluation_failed" in str(record.msg) for record in caplog.records)


async def test_job_logs_each_run_with_counts(
    db_app: FastAPI, factory: Factory, setup: Setup, caplog: pytest.LogCaptureFixture
) -> None:
    now = utcnow()
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        received_at=now - timedelta(days=10),
        due_at=now - timedelta(days=1),
    )

    report = await AlertJob(db_app.state.container.session_factory, TZ).run()

    assert report is not None
    assert report.created > 0
    logged = [record.msg for record in caplog.records if "alerts_evaluated" in str(record.msg)]
    assert logged
    assert isinstance(logged[-1], dict)
    assert {"duration_ms", "created", "updated", "resolved", "bottlenecks"} <= logged[-1].keys()


async def test_scheduler_runs_the_job_every_interval(db_app: FastAPI) -> None:
    job = AlertJob(db_app.state.container.session_factory, TZ)
    scheduler = start_alert_scheduler(job, 15)
    try:
        scheduled = scheduler.get_job(ALERTS_JOB_ID)
        assert scheduled is not None
        assert scheduled.trigger.interval == timedelta(minutes=15)
        assert scheduled.max_instances == 1
    finally:
        scheduler.shutdown(wait=False)
