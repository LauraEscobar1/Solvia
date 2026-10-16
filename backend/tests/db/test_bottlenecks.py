from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
import time_machine
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Alert, Area, RequestEvent, ServiceRequest, User
from app.models.enums import (
    AlertSeverity,
    AlertType,
    BottleneckReason,
    RequestEventType,
    RequestPriority,
    RequestStatus,
    UserRole,
)
from app.services.alerts import AlertEvaluator
from app.services.bottlenecks import BottleneckCell, BottleneckDetector, bottleneck_reasons
from tests.db.conftest import Factory

TZ = ZoneInfo("America/Bogota")
NOW = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)
MEDIUM_HOURS = (24, 48, 120)
RECEIVED_MAX = 24
MIN_COUNT = 3


@dataclass
class Areas:
    support: Area
    finance: Area
    purchasing: Area
    requester: User


@pytest.fixture
def frozen() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


async def _historic(factory: Factory, area: Area, requester: User) -> None:
    started = NOW - timedelta(days=40)
    request = await factory.request(
        area=area,
        requester=requester,
        status=RequestStatus.CANCELLED,
        received_at=started,
        last_activity_at=NOW - timedelta(hours=1),
    )
    await factory.stage_change(request, to_status=RequestStatus.RECEIVED, at=started)
    await factory.stage_change(
        request,
        from_status=RequestStatus.RECEIVED,
        to_status=RequestStatus.CANCELLED,
        at=NOW - timedelta(hours=1),
    )


async def _waiting(factory: Factory, area: Area, requester: User, *, hours: int) -> ServiceRequest:
    received = NOW - timedelta(hours=hours)
    request = await factory.request(area=area, requester=requester, received_at=received)
    await factory.stage_change(request, to_status=RequestStatus.RECEIVED, at=received)
    return request


@pytest.fixture
async def areas(factory: Factory, frozen: time_machine.Traveller) -> Areas:
    await factory.sla_matrix({RequestPriority.MEDIUM: MEDIUM_HOURS})
    requester = await factory.user(UserRole.REQUESTER)
    support = await factory.area("Soporte")
    finance = await factory.area("Finanzas")
    purchasing = await factory.area("Compras")
    for area in (support, finance, purchasing):
        await _historic(factory, area, requester)
    for _ in range(3):
        await _waiting(factory, support, requester, hours=2)
    await _waiting(factory, finance, requester, hours=30)
    for _ in range(3):
        await _waiting(factory, purchasing, requester, hours=30)
    return Areas(support, finance, purchasing, requester)


def _cell(cells: list[BottleneckCell], area: Area, status: RequestStatus) -> BottleneckCell:
    return next(cell for cell in cells if cell.area_id == area.id and cell.status is status)


COUNT = (BottleneckReason.COUNT_ABOVE_MEDIAN,)
AVG = (BottleneckReason.AVG_ABOVE_SLA,)


@pytest.mark.parametrize(
    ("count", "median", "avg_hours", "sla_max", "min_count", "expected"),
    [
        (3, 2.0, 10.0, 24.0, 3, ()),
        (4, 2.0, 10.0, 24.0, 3, COUNT),
        (1, 0.0, 10.0, 24.0, 3, ()),
        (2, 0.0, 10.0, 24.0, 3, ()),
        (3, 0.0, 10.0, 24.0, 3, COUNT),
        (1, 0.0, 10.0, 24.0, 1, COUNT),
        (1, 1.0, 24.0, 24.0, 3, ()),
        (1, 1.0, 24.1, 24.0, 3, AVG),
        (0, 0.0, None, None, 3, ()),
    ],
)
def test_bottleneck_thresholds(
    count: int,
    median: float,
    avg_hours: float | None,
    sla_max: float | None,
    min_count: int,
    expected: tuple[BottleneckReason, ...],
) -> None:
    assert bottleneck_reasons(count, median, avg_hours, sla_max, min_count=min_count) == expected


async def test_detects_bottlenecks_from_controlled_history(
    session: AsyncSession, areas: Areas
) -> None:
    cells = await BottleneckDetector(session, min_count=MIN_COUNT).cells(TZ)

    support = _cell(cells, areas.support, RequestStatus.RECEIVED)
    finance = _cell(cells, areas.finance, RequestStatus.RECEIVED)
    purchasing = _cell(cells, areas.purchasing, RequestStatus.RECEIVED)
    assert (support.count, support.median_count) == (3, 1.0)
    assert support.avg_hours == pytest.approx(2.0)
    assert support.sla_max_hours == RECEIVED_MAX
    assert support.reasons == (BottleneckReason.COUNT_ABOVE_MEDIAN,)
    assert support.severity is AlertSeverity.WARNING
    assert finance.reasons == (BottleneckReason.AVG_ABOVE_SLA,)
    assert finance.avg_hours == pytest.approx(30.0)
    assert purchasing.reasons == (
        BottleneckReason.COUNT_ABOVE_MEDIAN,
        BottleneckReason.AVG_ABOVE_SLA,
    )
    assert purchasing.severity is AlertSeverity.CRITICAL
    assert purchasing.median_avg_hours is not None
    assert not _cell(cells, areas.support, RequestStatus.ASSIGNED).is_bottleneck
    assert len(cells) == 9


async def test_a_single_request_without_history_is_not_a_bottleneck_by_count(
    session: AsyncSession, factory: Factory, areas: Areas
) -> None:
    legal = await factory.area("Legal")
    await _waiting(factory, legal, areas.requester, hours=2)

    guarded = await BottleneckDetector(session, min_count=MIN_COUNT).cells(TZ)
    unguarded = await BottleneckDetector(session, min_count=1).cells(TZ)

    cell = _cell(guarded, legal, RequestStatus.RECEIVED)
    assert (cell.count, cell.median_count) == (1, 0.0)
    assert cell.reasons == ()
    assert not cell.is_bottleneck
    assert _cell(unguarded, legal, RequestStatus.RECEIVED).reasons == COUNT

    report = await AlertEvaluator(session).evaluate_all(TZ, bottleneck_min_count=MIN_COUNT)

    legal_alerts = list(
        await session.scalars(
            select(Alert).where(Alert.type == AlertType.BOTTLENECK, Alert.area_id == legal.id)
        )
    )
    assert report.bottlenecks == 3
    assert legal_alerts == []


async def test_time_in_stage_ignores_reassignments_within_the_stage(
    session: AsyncSession, factory: Factory, areas: Areas
) -> None:
    entered = NOW - timedelta(hours=30)
    request = await factory.request(
        area=areas.support,
        requester=areas.requester,
        status=RequestStatus.ASSIGNED,
        received_at=NOW - timedelta(hours=40),
    )
    await factory.stage_change(request, to_status=RequestStatus.RECEIVED, at=request.received_at)
    await factory.stage_change(
        request, from_status=RequestStatus.RECEIVED, to_status=RequestStatus.ASSIGNED, at=entered
    )
    session.add(
        RequestEvent(
            request_id=request.id,
            type=RequestEventType.ASSIGNED,
            from_status=RequestStatus.ASSIGNED,
            to_status=RequestStatus.ASSIGNED,
            created_at=NOW - timedelta(hours=1),
        )
    )
    await session.commit()

    cells = await BottleneckDetector(session, min_count=MIN_COUNT).cells(TZ)

    assert _cell(cells, areas.support, RequestStatus.ASSIGNED).avg_hours == pytest.approx(30.0)


async def test_bottleneck_alerts_are_created_once_and_resolved(
    session: AsyncSession, areas: Areas
) -> None:
    first = await AlertEvaluator(session).evaluate_all(TZ, bottleneck_min_count=MIN_COUNT)
    again = await AlertEvaluator(session).evaluate_all(TZ, bottleneck_min_count=MIN_COUNT)

    alerts = list(
        await session.scalars(
            select(Alert).where(Alert.type == AlertType.BOTTLENECK, Alert.resolved_at.is_(None))
        )
    )
    by_area = {alert.area_id: alert for alert in alerts}
    assert first.bottlenecks == 3
    assert again.created == 0
    assert set(by_area) == {areas.support.id, areas.finance.id, areas.purchasing.id}
    purchasing = by_area[areas.purchasing.id]
    assert purchasing.request_id is None
    assert purchasing.severity is AlertSeverity.CRITICAL
    assert purchasing.message_code == "alert.bottleneck"
    assert purchasing.params == {
        "area_id": str(areas.purchasing.id),
        "status": "received",
        "count": 3,
        "avg_hours": 30.0,
        "reasons": ["count_above_median", "avg_above_sla"],
    }
    assert by_area[areas.support.id].severity is AlertSeverity.WARNING

    await session.execute(
        update(ServiceRequest)
        .where(
            ServiceRequest.area_id == areas.purchasing.id,
            ServiceRequest.status == RequestStatus.RECEIVED,
        )
        .values(status=RequestStatus.CANCELLED)
    )
    await session.commit()
    after = await AlertEvaluator(session).evaluate_all(TZ, bottleneck_min_count=MIN_COUNT)

    await session.refresh(purchasing)
    assert after.bottlenecks == 2
    assert purchasing.resolved_at == NOW
