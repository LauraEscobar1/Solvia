from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import httpx2
import pytest
import time_machine
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.analytics import UNASSIGNED, RiskAnalytics, RiskBreakdown
from app.ai.risk_model import ReferenceKind, RiskFactor
from app.models import Area, ServiceRequest, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
from tests.db.conftest import Factory

NOW = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)
HIGH_HOURS = (8, 24, 72)
MEDIUM_HOURS = (24, 48, 120)
HIGH_RECEIVED_MAX = 8
HIGH_RECEIVED_INACTIVITY = 4


@dataclass
class Setup:
    support: Area
    finance: Area
    requester: User
    assignee: User


@pytest.fixture
def frozen() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture
async def setup(factory: Factory, frozen: time_machine.Traveller) -> Setup:
    support = await factory.area("Soporte")
    finance = await factory.area("Finanzas")
    await factory.sla_matrix(
        {RequestPriority.HIGH: HIGH_HOURS, RequestPriority.MEDIUM: MEDIUM_HOURS}
    )
    return Setup(
        support=support,
        finance=finance,
        requester=await factory.user(UserRole.REQUESTER),
        assignee=await factory.user(UserRole.ASSIGNEE, area=support),
    )


async def _history(
    factory: Factory, area: Area, requester: User, *, count: int, hours: float
) -> None:
    for index in range(count):
        entered = NOW - timedelta(days=10, hours=index)
        request = await factory.request(
            area=area,
            requester=requester,
            status=RequestStatus.ASSIGNED,
            priority=RequestPriority.HIGH,
            received_at=entered,
            last_activity_at=entered + timedelta(hours=hours),
        )
        await factory.stage_change(request, to_status=RequestStatus.RECEIVED, at=entered)
        await factory.stage_change(
            request,
            from_status=RequestStatus.RECEIVED,
            to_status=RequestStatus.ASSIGNED,
            at=entered + timedelta(hours=hours),
        )


async def _breakdown(session: AsyncSession, request: ServiceRequest) -> RiskBreakdown:
    risk = await RiskAnalytics(session).breakdown(request.id)
    assert risk is not None
    return risk


def _points(risk: RiskBreakdown) -> dict[RiskFactor, float]:
    return {item.factor: item.points for item in risk.factors}


async def test_score_combines_the_weighted_factors_with_an_explanation(
    session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=NOW - timedelta(hours=12),
        due_at=NOW - timedelta(hours=12) + timedelta(hours=104),
        last_activity_at=NOW - timedelta(hours=2),
    )

    risk = await _breakdown(session, request)

    stage = risk.factor(RiskFactor.STAGE_DELAY)
    assert stage.value == 12.0
    assert stage.reference == HIGH_RECEIVED_MAX
    assert stage.reference_kind is ReferenceKind.SLA_MAX
    assert stage.normalized == 1.0
    assert risk.factor(RiskFactor.SLA_CONSUMED).value == pytest.approx(0.12, abs=0.01)
    assert risk.factor(RiskFactor.INACTIVITY).reference == HIGH_RECEIVED_INACTIVITY
    assert risk.factor(RiskFactor.PRIORITY).value == "high"
    load = risk.factor(RiskFactor.ASSIGNEE_LOAD)
    assert load.value == UNASSIGNED
    assert load.normalized == 1.0
    assert _points(risk) == {
        RiskFactor.STAGE_DELAY: 25.0,
        RiskFactor.SLA_CONSUMED: 2.3,
        RiskFactor.INACTIVITY: 5.0,
        RiskFactor.PRIORITY: 10.5,
        RiskFactor.ASSIGNEE_LOAD: 10.0,
    }
    assert risk.score == 53
    assert risk.score == round(sum(_points(risk).values()))


async def test_unassigned_request_within_its_reference_weighs_half(
    session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=NOW - timedelta(hours=4),
    )

    load = (await _breakdown(session, request)).factor(RiskFactor.ASSIGNEE_LOAD)

    assert load.normalized == 0.5
    assert load.points == 5.0


async def test_assignee_load_counts_their_open_requests(
    session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    for _ in range(3):
        await factory.request(
            area=setup.support,
            requester=setup.requester,
            status=RequestStatus.ASSIGNED,
            assignee=setup.assignee,
        )
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        status=RequestStatus.COMPLETED,
        assignee=setup.assignee,
    )
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        status=RequestStatus.IN_PROGRESS,
        assignee=setup.assignee,
    )

    load = (await _breakdown(session, request)).factor(RiskFactor.ASSIGNEE_LOAD)

    assert load.value == 4.0
    assert load.normalized == 0.4


@pytest.mark.parametrize(("elapsed", "expected"), [(52, 0.333), (104, 0.667), (208, 1.0)])
async def test_sla_consumed_keeps_growing_until_150_percent(
    session: AsyncSession, factory: Factory, setup: Setup, elapsed: int, expected: float
) -> None:
    received = NOW - timedelta(hours=elapsed)
    request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=received,
        due_at=received + timedelta(hours=104),
    )

    factor = (await _breakdown(session, request)).factor(RiskFactor.SLA_CONSUMED)

    assert factor.normalized == pytest.approx(expected, abs=0.001)


async def test_reference_uses_area_p90_then_stage_p90_then_sla_max(
    session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    await _history(factory, setup.support, setup.requester, count=10, hours=6)
    await _history(factory, setup.finance, setup.requester, count=5, hours=30)
    other = await factory.area("Compras")
    support_request = await factory.request(
        area=setup.support,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=NOW - timedelta(hours=3),
    )
    finance_request = await factory.request(
        area=setup.finance,
        requester=setup.requester,
        priority=RequestPriority.HIGH,
        received_at=NOW - timedelta(hours=3),
    )
    medium_request = await factory.request(
        area=other,
        requester=setup.requester,
        priority=RequestPriority.MEDIUM,
        received_at=NOW - timedelta(hours=3),
    )

    rows = await RiskAnalytics(session).refresh_baselines()
    support = (await _breakdown(session, support_request)).factor(RiskFactor.STAGE_DELAY)
    finance = (await _breakdown(session, finance_request)).factor(RiskFactor.STAGE_DELAY)
    medium = (await _breakdown(session, medium_request)).factor(RiskFactor.STAGE_DELAY)

    assert rows == 2
    assert support.reference_kind is ReferenceKind.P90_AREA
    assert support.reference == pytest.approx(6.0)
    assert finance.reference_kind is ReferenceKind.P90_STAGE
    assert finance.reference == pytest.approx(30.0)
    assert medium.reference_kind is ReferenceKind.SLA_MAX
    assert medium.reference == MEDIUM_HOURS[0]


async def test_closed_requests_have_no_risk(
    session: AsyncSession, factory: Factory, setup: Setup
) -> None:
    request = await factory.request(
        area=setup.support, requester=setup.requester, status=RequestStatus.COMPLETED
    )

    assert await RiskAnalytics(session).breakdown(request.id) is None


async def test_list_exposes_and_sorts_by_risk(
    db_client: httpx2.AsyncClient, factory: Factory, setup: Setup
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    calm = await factory.request(
        area=setup.support,
        requester=setup.requester,
        title="Tranquila",
        priority=RequestPriority.MEDIUM,
        received_at=NOW - timedelta(hours=1),
        due_at=NOW + timedelta(hours=191),
    )
    urgent = await factory.request(
        area=setup.support,
        requester=setup.requester,
        title="Urgente",
        priority=RequestPriority.HIGH,
        received_at=NOW - timedelta(hours=150),
        due_at=NOW - timedelta(hours=46),
    )
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        title="Cerrada",
        status=RequestStatus.COMPLETED,
    )

    response = await db_client.get(
        "/api/v1/requests",
        headers=factory.auth_headers(admin),
        params={"sort": "-risk_score"},
    )

    items = response.json()["items"]
    assert [item["title"] for item in items] == ["Urgente", "Tranquila", "Cerrada"]
    assert items[0]["risk_score"] > items[1]["risk_score"] > 0
    assert items[2]["risk_score"] is None
    assert [item["id"] for item in items[:2]] == [str(urgent.id), str(calm.id)]


async def test_min_risk_filters_the_list_and_the_board(
    db_client: httpx2.AsyncClient, factory: Factory, setup: Setup
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(admin)
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        title="Tranquila",
        priority=RequestPriority.MEDIUM,
        received_at=NOW - timedelta(hours=1),
        due_at=NOW + timedelta(hours=191),
    )
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        title="Urgente",
        priority=RequestPriority.HIGH,
        received_at=NOW - timedelta(hours=150),
        due_at=NOW - timedelta(hours=46),
    )
    await factory.request(
        area=setup.support,
        requester=setup.requester,
        title="Cerrada",
        status=RequestStatus.COMPLETED,
    )

    listed = await db_client.get("/api/v1/requests", headers=headers, params={"min_risk": 70})
    board = await db_client.get("/api/v1/requests/board", headers=headers, params={"min_risk": 70})
    invalid = await db_client.get("/api/v1/requests", headers=headers, params={"min_risk": 101})

    items = listed.json()["items"]
    assert [item["title"] for item in items] == ["Urgente"]
    assert items[0]["risk_score"] >= 70
    columns = {column["status"]: column for column in board.json()["columns"]}
    assert [card["title"] for card in columns["received"]["items"]] == ["Urgente"]
    assert columns["received"]["total"] == 1
    assert columns["completed"]["total"] == 0
    assert invalid.status_code == 422
