from dataclasses import dataclass
from typing import Any

import httpx2
import pytest

from app.models import Area, User
from app.models.enums import SLA_STAGES, RequestPriority, UserRole
from tests.db.conftest import Factory

ROLES = ("admin", "supervisor", "assignee", "requester", "anonymous")

SLA_MATRIX = [
    {"priority": priority.value, "status": stage.value, "max_hours": 10, "inactivity_hours": 5}
    for priority in RequestPriority
    for stage in SLA_STAGES
]


@dataclass
class World:
    area: Area
    other_area: Area
    users: dict[str, User]
    outsider: User
    target: User

    def headers(self, factory: Factory, role: str) -> dict[str, str]:
        return {} if role == "anonymous" else factory.auth_headers(self.users[role])


@pytest.fixture
async def world(factory: Factory) -> World:
    area = await factory.area("Soporte")
    other_area = await factory.area("Finanzas")
    users = {
        "admin": await factory.user(UserRole.ADMIN),
        "supervisor": await factory.user(UserRole.SUPERVISOR, area=area),
        "assignee": await factory.user(UserRole.ASSIGNEE, area=area),
        "requester": await factory.user(UserRole.REQUESTER, area=area),
    }
    outsider = await factory.user(UserRole.ASSIGNEE, area=other_area)
    target = await factory.user(UserRole.REQUESTER, area=area)
    return World(area, other_area, users, outsider, target)


def _expect(admin: int, supervisor: int, assignee: int, requester: int) -> dict[str, int]:
    return {
        "admin": admin,
        "supervisor": supervisor,
        "assignee": assignee,
        "requester": requester,
        "anonymous": 401,
    }


CASES: list[tuple[str, str, Any, dict[str, int]]] = [
    ("GET", "/api/v1/auth/me", None, _expect(200, 200, 200, 200)),
    ("GET", "/api/v1/areas", None, _expect(200, 200, 200, 200)),
    ("POST", "/api/v1/areas", {"name": "Nueva"}, _expect(201, 403, 403, 403)),
    ("GET", "/api/v1/areas/{area}", None, _expect(200, 200, 200, 200)),
    ("PATCH", "/api/v1/areas/{area}", {"description": "x"}, _expect(200, 403, 403, 403)),
    ("POST", "/api/v1/areas/{area}/deactivate", None, _expect(200, 403, 403, 403)),
    ("POST", "/api/v1/areas/{area}/activate", None, _expect(200, 403, 403, 403)),
    ("GET", "/api/v1/users", None, _expect(200, 200, 403, 403)),
    (
        "POST",
        "/api/v1/users",
        {
            "full_name": "Nuevo",
            "email": "nuevo@example.com",
            "role": "requester",
            "temporary_password": "contrasena-temporal",
        },
        _expect(201, 403, 403, 403),
    ),
    ("GET", "/api/v1/users/{self}", None, _expect(200, 200, 200, 200)),
    ("GET", "/api/v1/users/{target}", None, _expect(200, 200, 403, 403)),
    ("GET", "/api/v1/users/{outsider}", None, _expect(200, 403, 403, 403)),
    ("PATCH", "/api/v1/users/{target}", {"full_name": "Cambio"}, _expect(200, 403, 403, 403)),
    ("POST", "/api/v1/users/{target}/deactivate", None, _expect(200, 403, 403, 403)),
    ("POST", "/api/v1/users/{target}/activate", None, _expect(200, 403, 403, 403)),
    ("GET", "/api/v1/sla-policies", None, _expect(200, 403, 403, 403)),
    ("PUT", "/api/v1/sla-policies", SLA_MATRIX, _expect(200, 403, 403, 403)),
]


@pytest.mark.parametrize("role", ROLES)
@pytest.mark.parametrize(
    ("method", "path", "body", "expected"),
    CASES,
    ids=[f"{method} {path}" for method, path, _, _ in CASES],
)
async def test_role_permissions(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    world: World,
    role: str,
    method: str,
    path: str,
    body: Any,
    expected: dict[str, int],
) -> None:
    self_user = world.users.get(role, world.target)
    url = path.format(
        area=world.area.id, self=self_user.id, target=world.target.id, outsider=world.outsider.id
    )

    response = await db_client.request(method, url, headers=world.headers(factory, role), json=body)

    assert response.status_code == expected[role], response.text
    if response.status_code == 403:
        assert response.json()["error"]["code"] == "auth.forbidden"


async def test_supervisor_only_lists_users_of_their_area(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    response = await db_client.get(
        "/api/v1/users",
        headers=world.headers(factory, "supervisor"),
        params={"area_id": str(world.other_area.id)},
    )

    assert response.status_code == 200
    ids = {item["id"] for item in response.json()["items"]}
    expected = {str(user.id) for user in world.users.values() if user.area_id == world.area.id}
    assert ids == expected | {str(world.target.id)}
    assert str(world.outsider.id) not in ids


async def test_non_admins_only_see_active_areas(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    await db_client.post(
        f"/api/v1/areas/{world.other_area.id}/deactivate", headers=world.headers(factory, "admin")
    )

    as_requester = await db_client.get("/api/v1/areas", headers=world.headers(factory, "requester"))
    as_admin = await db_client.get("/api/v1/areas", headers=world.headers(factory, "admin"))
    detail = await db_client.get(
        f"/api/v1/areas/{world.other_area.id}", headers=world.headers(factory, "requester")
    )

    assert [area["name"] for area in as_requester.json()["items"]] == ["Soporte"]
    assert {area["name"] for area in as_admin.json()["items"]} == {"Soporte", "Finanzas"}
    assert detail.status_code == 404
    assert detail.json()["error"]["code"] == "area.not_found"
