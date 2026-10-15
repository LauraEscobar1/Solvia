import httpx2
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import SLA_STAGES, RequestPriority, UserRole
from tests.db.conftest import PASSWORD, Factory, login

NEW_PASSWORD = "contrasena-temporal-nueva"


def _matrix(max_hours: int = 10, inactivity_hours: int = 5) -> list[dict[str, object]]:
    return [
        {
            "priority": priority.value,
            "status": stage.value,
            "max_hours": max_hours,
            "inactivity_hours": inactivity_hours,
        }
        for priority in RequestPriority
        for stage in SLA_STAGES
    ]


async def test_admin_cannot_deactivate_themselves(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    await factory.user(UserRole.ADMIN)

    response = await db_client.post(
        f"/api/v1/users/{admin.id}/deactivate", headers=factory.auth_headers(admin)
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "user.cannot_deactivate_self"


async def test_at_least_one_active_admin_must_remain(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    first = await factory.user(UserRole.ADMIN)
    second = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(first)

    deactivated = await db_client.post(f"/api/v1/users/{second.id}/deactivate", headers=headers)
    demote_last = await db_client.patch(
        f"/api/v1/users/{first.id}", headers=headers, json={"role": "supervisor"}
    )
    reactivated = await db_client.post(f"/api/v1/users/{second.id}/activate", headers=headers)
    demote_with_other = await db_client.patch(
        f"/api/v1/users/{first.id}", headers=headers, json={"role": "supervisor"}
    )

    assert deactivated.status_code == 200
    assert demote_last.status_code == 409
    assert demote_last.json()["error"]["code"] == "user.last_admin"
    assert reactivated.status_code == 200
    assert demote_with_other.status_code == 200
    assert demote_with_other.json()["role"] == "supervisor"


async def test_the_only_admin_left_cannot_deactivate_themselves(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    acting = await factory.user(UserRole.ADMIN)
    only_other = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(acting)
    await db_client.patch(
        f"/api/v1/users/{acting.id}", headers=headers, json={"role": "supervisor"}
    )

    response = await db_client.post(
        f"/api/v1/users/{only_other.id}/deactivate",
        headers=factory.auth_headers(only_other),
    )

    assert response.status_code == 409
    assert response.json()["error"]["code"] == "user.cannot_deactivate_self"


async def test_deactivating_a_user_revokes_their_sessions(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    user = await factory.user()
    tokens = await login(db_client, user.email)

    await db_client.post(f"/api/v1/users/{user.id}/deactivate", headers=factory.auth_headers(admin))
    refresh = await db_client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert refresh.status_code == 401


async def test_create_user_with_temporary_password(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    area = await factory.area("Soporte")
    headers = factory.auth_headers(admin)
    payload = {
        "full_name": "  Laura Pérez  ",
        "email": "Laura@Example.com",
        "role": "assignee",
        "area_id": str(area.id),
        "temporary_password": NEW_PASSWORD,
    }

    created = await db_client.post("/api/v1/users", headers=headers, json=payload)
    duplicate = await db_client.post(
        "/api/v1/users", headers=headers, json={**payload, "email": "LAURA@example.com"}
    )
    short = await db_client.post(
        "/api/v1/users",
        headers=headers,
        json={**payload, "email": "otra@example.com", "temporary_password": "corta"},
    )

    assert created.status_code == 201
    body = created.json()
    assert body["email"] == "laura@example.com"
    assert body["full_name"] == "Laura Pérez"
    assert body["must_change_password"] is True
    assert body["area"]["name"] == "Soporte"
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "user.email_taken"
    assert short.status_code == 422
    tokens = await login(db_client, "laura@example.com", NEW_PASSWORD)
    assert tokens["user"]["must_change_password"] is True


async def test_user_area_must_exist_and_be_active(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    inactive = await factory.area("Cerrada", is_active=False)

    response = await db_client.post(
        "/api/v1/users",
        headers=factory.auth_headers(admin),
        json={
            "full_name": "X",
            "email": "x@example.com",
            "role": "requester",
            "area_id": str(inactive.id),
            "temporary_password": NEW_PASSWORD,
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "user.invalid_area"


async def test_admin_resetting_password_forces_change_and_revokes_sessions(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    user = await factory.user()
    tokens = await login(db_client, user.email)

    response = await db_client.patch(
        f"/api/v1/users/{user.id}",
        headers=factory.auth_headers(admin),
        json={"temporary_password": NEW_PASSWORD},
    )
    refresh = await db_client.post(
        "/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}
    )

    assert response.json()["must_change_password"] is True
    assert refresh.status_code == 401
    await login(db_client, user.email, NEW_PASSWORD)
    old = await db_client.post(
        "/api/v1/auth/login", json={"email": user.email, "password": PASSWORD}
    )
    assert old.status_code == 401


async def test_area_name_is_unique_ignoring_case(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(admin)
    await db_client.post("/api/v1/areas", headers=headers, json={"name": "Soporte TI"})
    other = (
        await db_client.post("/api/v1/areas", headers=headers, json={"name": "Finanzas"})
    ).json()

    duplicate = await db_client.post("/api/v1/areas", headers=headers, json={"name": "soporte ti"})
    renamed = await db_client.patch(
        f"/api/v1/areas/{other['id']}", headers=headers, json={"name": "SOPORTE TI"}
    )

    for response in (duplicate, renamed):
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "area.name_taken"


async def test_area_manager_must_be_active_supervisor_or_admin(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    supervisor = await factory.user(UserRole.SUPERVISOR)
    assignee = await factory.user(UserRole.ASSIGNEE)
    inactive_supervisor = await factory.user(UserRole.SUPERVISOR, is_active=False)
    headers = factory.auth_headers(admin)

    invalid = [
        await db_client.post(
            "/api/v1/areas", headers=headers, json={"name": f"A{i}", "manager_id": str(user.id)}
        )
        for i, user in enumerate((assignee, inactive_supervisor))
    ]
    valid = await db_client.post(
        "/api/v1/areas", headers=headers, json={"name": "B", "manager_id": str(supervisor.id)}
    )
    cleared = await db_client.patch(
        f"/api/v1/areas/{valid.json()['id']}", headers=headers, json={"manager_id": None}
    )

    for response in invalid:
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "area.invalid_manager"
    assert valid.status_code == 201
    assert valid.json()["manager"]["id"] == str(supervisor.id)
    assert cleared.json()["manager"] is None


async def test_sla_matrix_replace_and_validation(
    db_client: httpx2.AsyncClient, factory: Factory, session: AsyncSession
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(admin)

    first = await db_client.put("/api/v1/sla-policies", headers=headers, json=_matrix(10, 5))
    second = await db_client.put("/api/v1/sla-policies", headers=headers, json=_matrix(20, 20))
    incomplete = await db_client.put("/api/v1/sla-policies", headers=headers, json=_matrix()[:-1])
    duplicated = await db_client.put(
        "/api/v1/sla-policies", headers=headers, json=[*_matrix()[:-1], _matrix()[0]]
    )
    exceeds = await db_client.put("/api/v1/sla-policies", headers=headers, json=_matrix(10, 11))
    closed_stage = await db_client.put(
        "/api/v1/sla-policies",
        headers=headers,
        json=[{**_matrix()[0], "status": "completed"}, *_matrix()[1:]],
    )

    assert first.status_code == 200
    assert len(second.json()) == 12
    assert {(p["max_hours"], p["inactivity_hours"]) for p in second.json()} == {(20, 20)}
    assert [p["priority"] for p in second.json()][:3] == ["critical"] * 3
    assert [p["status"] for p in second.json()][:3] == ["received", "assigned", "in_progress"]
    for response in (incomplete, duplicated):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "sla.incomplete_matrix"
    assert exceeds.json()["error"]["params"]["fields"][0]["type"] == "inactivity_exceeds_max"
    assert closed_stage.json()["error"]["params"]["fields"][0]["type"] == "sla_stage"
