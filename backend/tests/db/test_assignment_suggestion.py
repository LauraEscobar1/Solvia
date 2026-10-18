from dataclasses import dataclass

import httpx2
import pytest

from app.models import Area, ServiceRequest, User
from app.models.enums import RequestStatus, UserRole
from tests.db.conftest import Factory


@dataclass
class Team:
    support: Area
    finance: Area
    people: dict[str, User]

    def headers(self, factory: Factory, actor: str) -> dict[str, str]:
        return factory.auth_headers(self.people[actor])


@pytest.fixture
async def team(factory: Factory) -> Team:
    support = await factory.area("Soporte")
    finance = await factory.area("Finanzas")
    people = {
        "admin": await factory.user(UserRole.ADMIN),
        "supervisor": await factory.user(UserRole.SUPERVISOR, area=support),
        "busy": await factory.user(UserRole.ASSIGNEE, area=support),
        "light": await factory.user(UserRole.ASSIGNEE, area=support),
        "idle_inactive": await factory.user(UserRole.ASSIGNEE, area=support, is_active=False),
        "other_area": await factory.user(UserRole.ASSIGNEE, area=finance),
        "carla": await factory.user(UserRole.REQUESTER),
    }
    return Team(support, finance, people)


async def _load(factory: Factory, team: Team, assignee: str, count: int) -> list[ServiceRequest]:
    return [
        await factory.request(
            area=team.support,
            requester=team.people["carla"],
            status=RequestStatus.IN_PROGRESS,
            assignee=team.people[assignee],
        )
        for _ in range(count)
    ]


async def _suggest(
    client: httpx2.AsyncClient, factory: Factory, team: Team, actor: str, request: ServiceRequest
) -> httpx2.Response:
    return await client.get(
        f"/api/v1/requests/{request.id}/assignment-suggestion", headers=team.headers(factory, actor)
    )


async def test_suggests_the_active_area_assignee_with_less_open_work(
    db_client: httpx2.AsyncClient, factory: Factory, team: Team
) -> None:
    busy = await _load(factory, team, "busy", 4)
    await _load(factory, team, "light", 1)
    await factory.request(
        area=team.support,
        requester=team.people["carla"],
        status=RequestStatus.COMPLETED,
        assignee=team.people["light"],
    )

    response = await _suggest(db_client, factory, team, "supervisor", busy[0])

    assert response.status_code == 200
    assert response.json() == {
        "suggestion": {
            "assignee": {
                "id": str(team.people["light"].id),
                "full_name": team.people["light"].full_name,
            },
            "open_count": 1,
            "current_open_count": 4,
        }
    }


async def test_unassigned_requests_get_the_least_loaded_assignee(
    db_client: httpx2.AsyncClient, factory: Factory, team: Team
) -> None:
    await _load(factory, team, "busy", 2)
    await _load(factory, team, "light", 1)
    request = await factory.request(area=team.support, requester=team.people["carla"])

    body = (await _suggest(db_client, factory, team, "admin", request)).json()

    assert body["suggestion"]["assignee"]["id"] == str(team.people["light"].id)
    assert body["suggestion"]["current_open_count"] is None


async def test_no_suggestion_when_nobody_has_less_work(
    db_client: httpx2.AsyncClient, factory: Factory, team: Team
) -> None:
    light = await _load(factory, team, "light", 1)
    await _load(factory, team, "busy", 3)

    response = await _suggest(db_client, factory, team, "supervisor", light[0])

    assert response.json() == {"suggestion": None}


@pytest.mark.parametrize("actor", ["busy", "carla"])
async def test_only_who_can_assign_gets_a_suggestion(
    db_client: httpx2.AsyncClient, factory: Factory, team: Team, actor: str
) -> None:
    busy = await _load(factory, team, "busy", 3)

    response = await _suggest(db_client, factory, team, actor, busy[0])

    assert response.status_code == 200
    assert response.json() == {"suggestion": None}


async def test_closed_or_invisible_requests(
    db_client: httpx2.AsyncClient, factory: Factory, team: Team
) -> None:
    closed = await factory.request(
        area=team.support,
        requester=team.people["carla"],
        status=RequestStatus.COMPLETED,
        assignee=team.people["busy"],
    )
    foreign = await factory.request(area=team.finance, requester=team.people["admin"])

    closed_response = await _suggest(db_client, factory, team, "admin", closed)

    assert closed_response.json() == {"suggestion": None}
    assert (await _suggest(db_client, factory, team, "supervisor", foreign)).status_code == 404
