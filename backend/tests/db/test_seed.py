from typing import Any

import pytest
from pydantic import SecretStr
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Environment, Settings
from app.core.security import verify_password
from app.models import Area, SlaPolicy, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
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
