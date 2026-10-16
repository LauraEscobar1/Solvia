from datetime import timedelta
from typing import Any

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Environment, Settings
from app.core.security import verify_password
from app.core.time import utcnow
from app.models import Area, RequestEvent, ServiceRequest, SlaPolicy, User
from app.models.enums import (
    CLOSED_STATUSES,
    RequestEventType,
    RequestPriority,
    RequestStatus,
    UserRole,
)
from app.scripts.seed import SeedError, seed
from tests.conftest import make_settings

ADMIN_PASSWORD = "admin-semilla-segura"
DEMO_PASSWORD = "demo-semilla-segura"


def _seed_settings(db_settings: Settings, **overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "database_url": db_settings.database_url,
        "seed_admin_email": "Admin@Example.com",
        "seed_admin_password": SecretStr(ADMIN_PASSWORD),
        **overrides,
    }
    return make_settings(**values)


async def _counts(session: AsyncSession) -> tuple[int, int, int]:
    users = await session.scalar(select(func.count()).select_from(User))
    areas = await session.scalar(select(func.count()).select_from(Area))
    policies = await session.scalar(select(func.count()).select_from(SlaPolicy))
    return users or 0, areas or 0, policies or 0


async def test_seed_is_idempotent(session: AsyncSession, db_settings: Settings) -> None:
    settings = _seed_settings(
        db_settings,
        environment=Environment.DEVELOPMENT,
        seed_demo_password=SecretStr(DEMO_PASSWORD),
    )

    first = await seed(session, settings)
    after_first = await _counts(session)
    second = await seed(session, settings)
    after_second = await _counts(session)

    assert (first.users_created, first.areas_created, first.sla_policies_created) == (4, 3, 12)
    assert (second.users_created, second.areas_created, second.sla_policies_created) == (0, 0, 0)
    assert after_first == after_second == (4, 3, 12)


async def test_seed_creates_admin_from_environment(
    session: AsyncSession, db_settings: Settings
) -> None:
    await seed(session, _seed_settings(db_settings))

    admin = await session.scalar(select(User).where(User.role == UserRole.ADMIN))
    assert admin is not None
    assert admin.email == "admin@example.com"
    assert verify_password(ADMIN_PASSWORD, admin.password_hash)[0]


async def test_seed_does_not_overwrite_existing_admin_password(
    session: AsyncSession, db_settings: Settings
) -> None:
    await seed(session, _seed_settings(db_settings))
    await seed(
        session,
        _seed_settings(db_settings, seed_admin_password=SecretStr("otra-contrasena-larga")),
    )

    admin = await session.scalar(select(User).where(User.role == UserRole.ADMIN))
    assert admin is not None
    assert verify_password(ADMIN_PASSWORD, admin.password_hash)[0]


async def test_seed_sla_matrix_uses_half_for_inactivity(
    session: AsyncSession, db_settings: Settings
) -> None:
    await seed(session, _seed_settings(db_settings))

    policies = {
        (p.priority, p.status): (p.max_hours, p.inactivity_hours)
        for p in await session.scalars(select(SlaPolicy))
    }
    assert policies[(RequestPriority.CRITICAL, RequestStatus.RECEIVED)] == (4, 2)
    assert policies[(RequestPriority.HIGH, RequestStatus.ASSIGNED)] == (24, 12)
    assert policies[(RequestPriority.MEDIUM, RequestStatus.IN_PROGRESS)] == (120, 60)
    assert policies[(RequestPriority.LOW, RequestStatus.IN_PROGRESS)] == (240, 120)


async def test_seed_demo_users_only_in_development(
    session: AsyncSession, db_settings: Settings
) -> None:
    report = await seed(
        session,
        _seed_settings(
            db_settings,
            environment=Environment.TEST,
            seed_demo_password=SecretStr(DEMO_PASSWORD),
        ),
    )

    assert report.demo_users_enabled is False
    assert await _counts(session) == (1, 3, 12)


async def test_seed_assigns_supervisor_as_area_manager(
    session: AsyncSession, db_settings: Settings
) -> None:
    await seed(
        session,
        _seed_settings(
            db_settings,
            environment=Environment.DEVELOPMENT,
            seed_demo_password=SecretStr(DEMO_PASSWORD),
        ),
    )

    area = await session.scalar(select(Area).where(Area.name == "Soporte TI"))
    supervisor = await session.scalar(select(User).where(User.role == UserRole.SUPERVISOR))
    assert area is not None
    assert supervisor is not None
    assert area.manager_id == supervisor.id
    assert supervisor.area_id == area.id


@pytest.mark.parametrize(
    "overrides",
    [
        {"seed_admin_email": None},
        {"seed_admin_password": None},
        {"seed_admin_email": "no-es-un-email"},
        {"seed_admin_password": SecretStr("corta")},
    ],
)
async def test_seed_requires_valid_admin_credentials(
    session: AsyncSession, db_settings: Settings, overrides: dict[str, Any]
) -> None:
    with pytest.raises(SeedError):
        await seed(session, _seed_settings(db_settings, **overrides))
    assert await _counts(session) == (0, 0, 0)


async def test_demo_seed_creates_requests_with_a_consistent_history(
    session: AsyncSession, db_settings: Settings
) -> None:
    settings = _seed_settings(db_settings, seed_demo_password=SecretStr(DEMO_PASSWORD))

    report = await seed(session, settings, demo=True)
    again = await seed(session, settings, demo=True)

    assert report.demo is not None
    assert report.demo.requests_created == 60
    assert report.demo.events_created > 60
    assert again.demo is not None
    assert again.demo.skipped is True
    statuses = dict(
        (
            await session.execute(
                select(ServiceRequest.status, func.count()).group_by(ServiceRequest.status)
            )
        ).all()
    )
    assert statuses == {
        RequestStatus.RECEIVED: 10,
        RequestStatus.ASSIGNED: 10,
        RequestStatus.IN_PROGRESS: 16,
        RequestStatus.COMPLETED: 19,
        RequestStatus.CANCELLED: 5,
    }
    for request in await session.scalars(select(ServiceRequest)):
        events = list(
            await session.scalars(
                select(RequestEvent)
                .where(RequestEvent.request_id == request.id)
                .order_by(RequestEvent.created_at, RequestEvent.id)
            )
        )
        assert events[0].type is RequestEventType.CREATED
        assert events[0].created_at == request.received_at
        assert request.last_activity_at == max(event.created_at for event in events)
        assert (request.completed_at is not None) is (request.status is RequestStatus.COMPLETED)
        if request.status is RequestStatus.RECEIVED:
            assert request.assignee_id is None
        elif request.status is not RequestStatus.CANCELLED:
            assert request.assignee_id is not None


async def test_demo_seed_mixes_overdue_and_stalled_requests(
    session: AsyncSession, db_settings: Settings
) -> None:
    await seed(
        session,
        _seed_settings(db_settings, seed_demo_password=SecretStr(DEMO_PASSWORD)),
        demo=True,
    )

    now = utcnow()
    open_requests = list(
        await session.scalars(
            select(ServiceRequest).where(ServiceRequest.status.not_in(CLOSED_STATUSES))
        )
    )
    overdue = [r for r in open_requests if r.due_at is not None and r.due_at < now]
    stale = [r for r in open_requests if now - r.last_activity_at > timedelta(days=3)]
    assert 0 < len(overdue) < len(open_requests)
    assert 0 < len(stale) < len(open_requests)


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({}, "SEED_DEMO_PASSWORD"),
        (
            {
                "environment": Environment.PRODUCTION,
                "jwt_secret": SecretStr("x" * 48),
                "seed_demo_password": SecretStr(DEMO_PASSWORD),
            },
            "producción",
        ),
    ],
)
async def test_demo_seed_guards(
    session: AsyncSession, db_settings: Settings, overrides: dict[str, Any], message: str
) -> None:
    with pytest.raises(SeedError, match=message):
        await seed(session, _seed_settings(db_settings, **overrides), demo=True)
