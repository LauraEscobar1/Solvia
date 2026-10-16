import argparse
import asyncio
import os
import random
import secrets
import sys
import uuid
from collections.abc import Awaitable, Callable, Sequence
from datetime import datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import event, insert, text
from sqlalchemy.engine import Connection, make_url
from sqlalchemy.engine.interfaces import DBAPICursor, ExecutionContext
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.security import hash_password
from app.core.time import utcnow
from app.models import Area, RequestEvent, ServiceRequest, SlaPolicy, User
from app.models.enums import SLA_STAGES, RequestEventType, RequestPriority, RequestStatus, UserRole
from app.schemas.alert import AlertListQuery, AlertState
from app.schemas.dashboard import DashboardQuery
from app.schemas.request import RequestListQuery
from app.scripts.seed import SLA_MAX_HOURS, inactivity_hours_for
from app.services.alerts import AlertEvaluator, AlertService
from app.services.dashboard import DashboardService
from app.services.requests import RequestService

DEFAULT_TEST_DATABASE_URL = "postgresql+asyncpg://solvia:solvia@localhost:5433/solvia_test"
RANDOM_SEED = 20261016
AREAS = 8
ASSIGNEES_PER_AREA = 4
REQUESTERS = 60
HISTORY_DAYS = 180
CHUNK = 5000
PRIORITY_WEIGHTS = {
    RequestPriority.CRITICAL: 1.0,
    RequestPriority.HIGH: 2.5,
    RequestPriority.MEDIUM: 4.0,
    RequestPriority.LOW: 2.5,
}
LIFETIME_FACTORS = (0.3, 1.6)
ASSIGNED_AT, STARTED_AT = 0.15, 0.35
CANCEL_PROBABILITY = 0.1
TRUNCATE_ALL = (
    "TRUNCATE users, areas, requests, request_events, sla_policies, alerts, alert_reads, "
    "ai_insights, refresh_tokens RESTART IDENTITY CASCADE"
)
TIMEZONE = "America/Bogota"


class SyntheticLoadError(Exception):
    pass


def _ensure_test_database(url: str) -> None:
    database = make_url(url).database or ""
    if not database.endswith("_test"):
        msg = f"Solo se generan datos sintéticos en bases de prueba (*_test), no en «{database}»"
        raise SyntheticLoadError(msg)


def _requests_and_events(
    rng: random.Random,
    now: datetime,
    count: int,
    *,
    areas: Sequence[uuid.UUID],
    assignees: dict[uuid.UUID, list[uuid.UUID]],
    requesters: Sequence[uuid.UUID],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    requests: list[dict[str, Any]] = []
    events: list[dict[str, Any]] = []
    priorities = list(PRIORITY_WEIGHTS)
    weights = list(PRIORITY_WEIGHTS.values())
    for _ in range(count):
        request_id = uuid.uuid4()
        priority = rng.choices(priorities, weights=weights)[0]
        area_id = rng.choice(areas)
        total = sum(SLA_MAX_HOURS[priority])
        received_at = now - timedelta(hours=rng.uniform(1, HISTORY_DAYS * 24))
        lifetime = timedelta(hours=total * rng.uniform(*LIFETIME_FACTORS))
        closes_at = received_at + lifetime
        received, assigned, in_progress = SLA_STAGES
        milestones = [
            (received_at + lifetime * ASSIGNED_AT, received, assigned),
            (received_at + lifetime * STARTED_AT, assigned, in_progress),
        ]
        if closes_at < now:
            closing = (
                RequestStatus.CANCELLED
                if rng.random() < CANCEL_PROBABILITY
                else RequestStatus.COMPLETED
            )
            milestones.append((closes_at, in_progress, closing))
        reached = [milestone for milestone in milestones if milestone[0] < now]
        status = reached[-1][2] if reached else RequestStatus.RECEIVED
        last_activity = reached[-1][0] if reached else received_at
        requests.append(
            {
                "id": request_id,
                "title": f"Solicitud sintética {len(requests) + 1}",
                "description": "Generada para revisar planes de consulta.",
                "area_id": area_id,
                "requester_id": rng.choice(requesters),
                "assignee_id": rng.choice(assignees[area_id]) if reached else None,
                "priority": priority,
                "status": status,
                "received_at": received_at,
                "due_at": received_at + timedelta(hours=total),
                "last_activity_at": last_activity,
                "completed_at": last_activity if status is RequestStatus.COMPLETED else None,
                "created_at": received_at,
                "updated_at": last_activity,
                "version": 1 + len(reached),
            }
        )
        events.append(
            {
                "request_id": request_id,
                "type": RequestEventType.CREATED,
                "from_status": None,
                "to_status": RequestStatus.RECEIVED,
                "created_at": received_at,
                "details": {},
            }
        )
        events.extend(
            {
                "request_id": request_id,
                "type": (
                    RequestEventType.ASSIGNED
                    if target is RequestStatus.ASSIGNED
                    else RequestEventType.STATUS_CHANGED
                ),
                "from_status": source,
                "to_status": target,
                "created_at": moment,
                "details": {},
            }
            for moment, source, target in reached
        )
    return requests, events


async def _insert(session: AsyncSession, model: type[Any], rows: list[dict[str, Any]]) -> None:
    for start in range(0, len(rows), CHUNK):
        await session.execute(insert(model), rows[start : start + CHUNK])


async def generate(session: AsyncSession, count: int, now: datetime) -> None:
    rng = random.Random(RANDOM_SEED)  # noqa: S311
    await session.execute(text(TRUNCATE_ALL))
    areas = [Area(name=f"Área sintética {index + 1}") for index in range(AREAS)]
    session.add_all(areas)
    await session.flush()
    unusable_hash = hash_password(secrets.token_urlsafe(32))

    def person(role: UserRole, label: str, area: Area | None = None) -> User:
        return User(
            full_name=label,
            email=f"{label.lower().replace(' ', '.')}@example.com",
            password_hash=unusable_hash,
            role=role,
            area_id=area.id if area else None,
        )

    admin = person(UserRole.ADMIN, "Admin sintetico")
    staff = {
        area.id: [
            person(UserRole.ASSIGNEE, f"Responsable {index} {position}", area)
            for position in range(ASSIGNEES_PER_AREA)
        ]
        for index, area in enumerate(areas)
    }
    requesters = [person(UserRole.REQUESTER, f"Solicitante {index}") for index in range(REQUESTERS)]
    session.add_all([admin, *requesters, *(user for users in staff.values() for user in users)])
    for priority, hours in SLA_MAX_HOURS.items():
        for stage, max_hours in zip(SLA_STAGES, hours, strict=True):
            session.add(
                SlaPolicy(
                    priority=priority,
                    status=stage,
                    max_hours=max_hours,
                    inactivity_hours=inactivity_hours_for(max_hours),
                )
            )
    await session.flush()

    requests, events = _requests_and_events(
        rng,
        now,
        count,
        areas=[area.id for area in areas],
        assignees={area_id: [user.id for user in users] for area_id, users in staff.items()},
        requesters=[user.id for user in requesters],
    )
    await _insert(session, ServiceRequest, requests)
    await _insert(session, RequestEvent, events)
    await session.commit()
    await session.execute(text("ANALYZE"))
    print(f"Generadas {len(requests)} solicitudes y {len(events)} eventos")  # noqa: T201


async def explain(session: AsyncSession) -> None:
    admin = (
        await session.execute(text("SELECT id FROM users WHERE role = 'admin' LIMIT 1"))
    ).scalar_one()
    actor = await session.get(User, admin)
    if actor is None:
        msg = "No hay administrador sintético; ejecuta primero la generación"
        raise SyntheticLoadError(msg)
    timezone = ZoneInfo(TIMEZONE)
    dashboard = DashboardService(session, timezone)
    alerts = AlertService(session, timezone)
    requests = RequestService(session, timezone)
    query = DashboardQuery()
    checks: dict[str, Callable[[], Awaitable[object]]] = {
        "dashboard/summary": lambda: dashboard.summary(actor, query),
        "dashboard/by-status": lambda: dashboard.by_status(actor, query),
        "dashboard/at-risk": lambda: dashboard.at_risk(actor, query),
        "dashboard/stalled": lambda: dashboard.stalled(actor, query),
        "dashboard/bottlenecks": lambda: dashboard.bottlenecks(actor, query),
        "dashboard/trends": lambda: dashboard.trends(actor, query),
        "dashboard/by-area": lambda: dashboard.by_area(actor, query),
        "alerts": lambda: alerts.search(actor, AlertListQuery(state=AlertState.OPEN)),
        "alerts/unread-count": lambda: alerts.unread_count(actor),
        "requests?stalled=true": lambda: requests.search(actor, RequestListQuery(stalled=True)),
    }
    await AlertEvaluator(session).evaluate_all(timezone)
    connection = await session.connection()
    for name, check in checks.items():
        captured: list[tuple[str, Any]] = []

        def capture(
            _conn: Connection,
            _cursor: DBAPICursor,
            statement: str,
            parameters: Any,
            _context: ExecutionContext | None,
            _executemany: bool,  # noqa: FBT001
            sink: list[tuple[str, Any]] = captured,
        ) -> None:
            if statement.lstrip().upper().startswith(("SELECT", "WITH")):
                sink.append((statement, parameters))

        event.listen(connection.sync_connection, "before_cursor_execute", capture)
        try:
            await check()
        finally:
            event.remove(connection.sync_connection, "before_cursor_execute", capture)
        for statement, parameters in captured:
            plan = await connection.exec_driver_sql(
                f"EXPLAIN (ANALYZE, BUFFERS) {statement}", parameters
            )
            print(f"\n=== {name} ===")  # noqa: T201
            for (line,) in plan:
                print(line)  # noqa: T201


async def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Genera datos sintéticos en la base de pruebas y revisa planes de consulta."
    )
    parser.add_argument("--requests", type=int, default=50_000)
    parser.add_argument("--explain", action="store_true", help="Muestra EXPLAIN ANALYZE")
    parser.add_argument("--skip-generate", action="store_true", help="Reutiliza los datos")
    args = parser.parse_args(argv)
    url = os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)
    try:
        _ensure_test_database(url)
    except SyntheticLoadError as exc:
        print(exc, file=sys.stderr)  # noqa: T201
        return 1
    engine = create_async_engine(url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            if not args.skip_generate:
                await generate(session, args.requests, utcnow())
            if args.explain:
                await explain(session)
    finally:
        await engine.dispose()
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
