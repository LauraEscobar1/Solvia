import httpx2

from app.models.enums import UserRole
from tests.db.conftest import Factory


async def test_areas_are_paginated(db_client: httpx2.AsyncClient, factory: Factory) -> None:
    admin = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(admin)
    for index in range(25):
        await factory.area(f"Área {index:02d}")

    first = (await db_client.get("/api/v1/areas", headers=headers, params={"size": 10})).json()
    last = (
        await db_client.get("/api/v1/areas", headers=headers, params={"page": 3, "size": 10})
    ).json()
    beyond = (
        await db_client.get("/api/v1/areas", headers=headers, params={"page": 4, "size": 10})
    ).json()

    assert (first["total"], first["page"], first["size"], len(first["items"])) == (25, 1, 10, 10)
    assert first["items"][0]["name"] == "Área 00"
    assert len(last["items"]) == 5
    assert last["items"][-1]["name"] == "Área 24"
    assert beyond["items"] == []
    assert beyond["total"] == 25


async def test_default_page_and_size_limits(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    headers = factory.auth_headers(admin)

    default = (await db_client.get("/api/v1/users", headers=headers)).json()
    too_big = await db_client.get("/api/v1/users", headers=headers, params={"size": 101})
    zero_page = await db_client.get("/api/v1/users", headers=headers, params={"page": 0})

    assert (default["page"], default["size"]) == (1, 20)
    for response in (too_big, zero_page):
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "common.validation_error"


async def test_search_escapes_like_wildcards(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN)
    await factory.area("100% Remoto")
    await factory.area("Soporte_TI")
    await factory.area("Finanzas")

    percent = await db_client.get(
        "/api/v1/areas", headers=factory.auth_headers(admin), params={"q": "%"}
    )
    underscore = await db_client.get(
        "/api/v1/areas", headers=factory.auth_headers(admin), params={"q": "_"}
    )

    assert [area["name"] for area in percent.json()["items"]] == ["100% Remoto"]
    assert [area["name"] for area in underscore.json()["items"]] == ["Soporte_TI"]


async def test_users_can_be_filtered_and_searched(
    db_client: httpx2.AsyncClient, factory: Factory
) -> None:
    admin = await factory.user(UserRole.ADMIN, email="admin@example.com")
    await factory.user(UserRole.ASSIGNEE, email="ana.lopez@example.com")
    await factory.user(UserRole.ASSIGNEE, email="bruno@example.com")
    await factory.user(UserRole.REQUESTER, email="carla@example.com", is_active=False)
    headers = factory.auth_headers(admin)

    assignees = (
        await db_client.get("/api/v1/users", headers=headers, params={"role": "assignee"})
    ).json()
    search = (await db_client.get("/api/v1/users", headers=headers, params={"q": "LOPEZ"})).json()
    inactive = (
        await db_client.get("/api/v1/users", headers=headers, params={"is_active": "false"})
    ).json()

    assert assignees["total"] == 2
    assert [user["email"] for user in search["items"]] == ["ana.lopez@example.com"]
    assert [user["email"] for user in inactive["items"]] == ["carla@example.com"]
