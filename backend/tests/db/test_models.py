import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Area, ServiceRequest, SlaPolicy, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
from tests.db.conftest import Factory


async def test_request_codes_come_from_the_sequence(
    session: AsyncSession, factory: Factory
) -> None:
    area = await factory.area()
    requester = await factory.user()

    async def create() -> str:
        request = ServiceRequest(
            title="Solicitud",
            description="Detalle",
            area_id=area.id,
            requester_id=requester.id,
            priority=RequestPriority.MEDIUM,
        )
        session.add(request)
        await session.flush()
        return request.code

    first, second = await create(), await create()
    await session.execute(text("ALTER SEQUENCE request_code_seq RESTART WITH 9999"))
    before_overflow, overflow = await create(), await create()
    await session.commit()

    assert (first, second) == ("SOL-0001", "SOL-0002")
    assert (before_overflow, overflow) == ("SOL-9999", "SOL-10000")


async def test_new_requests_start_as_received(session: AsyncSession, factory: Factory) -> None:
    area = await factory.area()
    requester = await factory.user()
    request = ServiceRequest(
        title="t",
        description="d",
        area_id=area.id,
        requester_id=requester.id,
        priority=RequestPriority.LOW,
    )
    session.add(request)
    await session.commit()

    assert request.status is RequestStatus.RECEIVED
    assert request.received_at is not None
    assert request.last_activity_at is not None


@pytest.mark.parametrize(
    "instance",
    [
        User(full_name="X", email="Mayus@example.com", password_hash="x", role=UserRole.ADMIN),
        SlaPolicy(
            priority=RequestPriority.LOW,
            status=RequestStatus.RECEIVED,
            max_hours=10,
            inactivity_hours=11,
        ),
        SlaPolicy(
            priority=RequestPriority.LOW,
            status=RequestStatus.COMPLETED,
            max_hours=10,
            inactivity_hours=5,
        ),
    ],
    ids=["email-en-minusculas", "inactividad-mayor-que-maximo", "etapa-cerrada"],
)
async def test_database_constraints(session: AsyncSession, instance: object) -> None:
    session.add(instance)
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_area_names_are_unique_ignoring_case(session: AsyncSession) -> None:
    session.add(Area(name="Soporte"))
    await session.flush()
    session.add(Area(name="SOPORTE"))
    with pytest.raises(IntegrityError):
        await session.flush()
