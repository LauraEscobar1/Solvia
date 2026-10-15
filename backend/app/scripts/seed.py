import asyncio
import sys
from dataclasses import dataclass

import structlog
from pydantic import EmailStr, TypeAdapter, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Environment, Settings, get_settings
from app.core.logging import configure_logging
from app.core.security import hash_password
from app.db.session import create_engine, create_session_factory
from app.models import Area, SlaPolicy, User
from app.models.enums import SLA_STAGES, RequestPriority, UserRole
from app.repositories.area import AreaRepository
from app.repositories.sla_policy import SlaPolicyRepository
from app.repositories.user import UserRepository

logger = structlog.get_logger(__name__)

MIN_PASSWORD_LENGTH = 12

SLA_MAX_HOURS: dict[RequestPriority, tuple[int, int, int]] = {
    RequestPriority.CRITICAL: (4, 8, 24),
    RequestPriority.HIGH: (8, 24, 72),
    RequestPriority.MEDIUM: (24, 48, 120),
    RequestPriority.LOW: (48, 96, 240),
}


@dataclass(frozen=True, slots=True)
class SeedArea:
    name: str
    description: str


@dataclass(frozen=True, slots=True)
class SeedUser:
    full_name: str
    email: str
    role: UserRole
    area_name: str
    manages_area: bool = False


SEED_AREAS = (
    SeedArea("Soporte TI", "Incidencias de equipos, accesos y software."),
    SeedArea("Recursos Humanos", "Contrataciones, permisos y nómina."),
    SeedArea("Finanzas", "Pagos, reembolsos y facturación."),
)

DEMO_USERS = (
    SeedUser(
        "Sofía Supervisora",
        "supervisor@example.com",
        UserRole.SUPERVISOR,
        "Soporte TI",
        manages_area=True,
    ),
    SeedUser("Andrés Responsable", "responsable1@example.com", UserRole.ASSIGNEE, "Soporte TI"),
    SeedUser(
        "Lucía Responsable", "responsable2@example.com", UserRole.ASSIGNEE, "Recursos Humanos"
    ),
)


class SeedError(Exception):
    pass


@dataclass(slots=True)
class SeedReport:
    users_created: int = 0
    areas_created: int = 0
    sla_policies_created: int = 0
    demo_users_enabled: bool = False


def inactivity_hours_for(max_hours: int) -> int:
    return max(1, max_hours // 2)


def _validated_password(value: str, variable: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        msg = f"{variable} debe tener al menos {MIN_PASSWORD_LENGTH} caracteres"
        raise SeedError(msg)
    return value


def _admin_credentials(settings: Settings) -> tuple[str, str]:
    if settings.seed_admin_email is None or settings.seed_admin_password is None:
        msg = "Define SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD en el entorno o en .env"
        raise SeedError(msg)
    try:
        email = TypeAdapter(EmailStr).validate_python(settings.seed_admin_email)
    except ValidationError as exc:
        msg = "SEED_ADMIN_EMAIL no es un email válido"
        raise SeedError(msg) from exc
    password = settings.seed_admin_password.get_secret_value()
    return email.lower(), _validated_password(password, "SEED_ADMIN_PASSWORD")


def _demo_password(settings: Settings) -> str | None:
    if settings.environment is not Environment.DEVELOPMENT or settings.seed_demo_password is None:
        return None
    return _validated_password(settings.seed_demo_password.get_secret_value(), "SEED_DEMO_PASSWORD")


async def seed(session: AsyncSession, settings: Settings) -> SeedReport:
    admin_email, admin_password = _admin_credentials(settings)
    demo_password = _demo_password(settings)
    report = SeedReport(demo_users_enabled=demo_password is not None)
    users = UserRepository(session)
    areas = AreaRepository(session)
    policies = SlaPolicyRepository(session)

    if await users.get_by_email(admin_email) is None:
        await users.add(
            User(
                full_name=settings.seed_admin_name,
                email=admin_email,
                password_hash=hash_password(admin_password),
                role=UserRole.ADMIN,
            )
        )
        report.users_created += 1

    areas_by_name: dict[str, Area] = {}
    for spec in SEED_AREAS:
        area = await areas.get_by_name(spec.name)
        if area is None:
            area = await areas.add(Area(name=spec.name, description=spec.description))
            report.areas_created += 1
        areas_by_name[spec.name] = area

    if demo_password is not None:
        for demo in DEMO_USERS:
            area = areas_by_name[demo.area_name]
            user = await users.get_by_email(demo.email)
            if user is None:
                user = await users.add(
                    User(
                        full_name=demo.full_name,
                        email=demo.email,
                        password_hash=hash_password(demo_password),
                        role=demo.role,
                        area_id=area.id,
                    )
                )
                report.users_created += 1
            if demo.manages_area and area.manager_id is None:
                area.manager_id = user.id

    existing = {(policy.priority, policy.status) for policy in await policies.list_ordered()}
    for priority, max_hours_by_stage in SLA_MAX_HOURS.items():
        for stage, max_hours in zip(SLA_STAGES, max_hours_by_stage, strict=True):
            if (priority, stage) in existing:
                continue
            session.add(
                SlaPolicy(
                    priority=priority,
                    status=stage,
                    max_hours=max_hours,
                    inactivity_hours=inactivity_hours_for(max_hours),
                )
            )
            report.sla_policies_created += 1

    await session.commit()
    return report


async def run(settings: Settings) -> int:
    engine = create_engine(settings)
    try:
        async with create_session_factory(engine)() as session:
            report = await seed(session, settings)
    except SeedError as exc:
        logger.error("seed_failed", reason=str(exc))
        return 1
    finally:
        await engine.dispose()
    logger.info(
        "seed_completed",
        users_created=report.users_created,
        areas_created=report.areas_created,
        sla_policies_created=report.sla_policies_created,
        demo_users_enabled=report.demo_users_enabled,
    )
    return 0


def main() -> None:
    settings = get_settings()
    configure_logging(settings)
    sys.exit(asyncio.run(run(settings)))


if __name__ == "__main__":
    main()
