from dataclasses import dataclass
from datetime import timedelta

import httpx2
import pytest

from app.core.time import utcnow
from app.models import Area, ServiceRequest, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
from tests.db.conftest import Factory

HIGH_HOURS = (8, 24, 72)


@dataclass
class Catalog:
    support: Area
    finance: Area
    people: dict[str, User]
    requests: dict[str, ServiceRequest]

    def headers(self, factory: Factory, actor: str) -> dict[str, str]:
        return factory.auth_headers(self.people[actor])


@pytest.fixture
async def catalog(factory: Factory) -> Catalog:
    support = await factory.area("Soporte")
    finance = await factory.area("Finanzas")
    people = {
        "admin": await factory.user(UserRole.ADMIN),
        "supervisor": await factory.user(UserRole.SUPERVISOR, area=support),
        "assignee": await factory.user(UserRole.ASSIGNEE, area=support),
        "finance_assignee": await factory.user(UserRole.ASSIGNEE, area=finance),
        "carla": await factory.user(UserRole.REQUESTER),
        "diego": await factory.user(UserRole.REQUESTER),
    }
    await factory.sla_matrix({RequestPriority.HIGH: HIGH_HOURS})
    now = utcnow()
    requests = {
        "printer": await factory.request(
            area=support,
            requester=people["carla"],
            title="Impresora atascada",
            priority=RequestPriority.HIGH,
            received_at=now - timedelta(days=10),
            due_at=now - timedelta(days=1),
        ),
        "vpn": await factory.request(
            area=support,
            requester=people["diego"],
            status=RequestStatus.IN_PROGRESS,
            assignee=people["assignee"],
            title="Acceso VPN",
            priority=RequestPriority.CRITICAL,
            received_at=now - timedelta(hours=10),
            due_at=now + timedelta(hours=1),
            last_activity_at=now - timedelta(hours=9),
        ),
        "refund": await factory.request(
            area=finance,
            requester=people["carla"],
            status=RequestStatus.ASSIGNED,
            assignee=people["finance_assignee"],
            title="Reembolso de viaje",
            priority=RequestPriority.LOW,
            received_at=now - timedelta(hours=2),
            due_at=now + timedelta(days=10),
        ),
        "invoice": await factory.request(
            area=finance,
            requester=people["diego"],
            status=RequestStatus.COMPLETED,
            assignee=people["finance_assignee"],
            title="Factura duplicada",
            priority=RequestPriority.MEDIUM,
            received_at=now - timedelta(days=40),
            due_at=now - timedelta(days=30),
        ),
        "cancelled": await factory.request(
            area=support,
            requester=people["carla"],
            status=RequestStatus.CANCELLED,
            title="Monitor extra",
            received_at=now - timedelta(days=3),
        ),
    }
    return Catalog(support, finance, people, requests)


async def _titles(
    client: httpx2.AsyncClient,
    headers: dict[str, str],
    params: dict[str, str] | list[tuple[str, str]] | None = None,
) -> list[str]:
    query = tuple(params) if isinstance(params, list) else params
    response = await client.get("/api/v1/requests", headers=headers, params=query)
    assert response.status_code == 200, response.text
    return [item["title"] for item in response.json()["items"]]


@pytest.mark.parametrize(
    ("actor", "expected"),
    [
        ("admin", {"printer", "vpn", "refund", "invoice", "cancelled"}),
        ("supervisor", {"printer", "vpn", "cancelled"}),
        ("assignee", {"printer", "vpn", "cancelled"}),
        ("finance_assignee", {"refund", "invoice"}),
        ("carla", {"printer", "refund", "cancelled"}),
        ("diego", {"vpn", "invoice"}),
    ],
)
async def test_list_and_detail_scope_by_role(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    catalog: Catalog,
    actor: str,
    expected: set[str],
) -> None:
    headers = catalog.headers(factory, actor)

    titles = set(await _titles(db_client, headers, {"size": "100"}))

    assert titles == {catalog.requests[key].title for key in expected}
    for key, request in catalog.requests.items():
        detail = await db_client.get(f"/api/v1/requests/{request.id}", headers=headers)
        assert detail.status_code == (200 if key in expected else 404)


async def test_filters_combine(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    headers = catalog.headers(factory, "admin")
    support = str(catalog.support.id)

    by_status = await _titles(
        db_client, headers, [("status", "in_progress"), ("status", "assigned")]
    )
    by_priority = await _titles(db_client, headers, [("priority", "critical"), ("priority", "low")])
    by_area_and_status = await _titles(
        db_client, headers, [("area_id", support), ("status", "received")]
    )
    by_assignee = await _titles(
        db_client, headers, {"assignee_id": str(catalog.people["finance_assignee"].id)}
    )
    by_requester = await _titles(
        db_client, headers, {"requester_id": str(catalog.people["diego"].id)}
    )

    assert set(by_status) == {"Acceso VPN", "Reembolso de viaje"}
    assert set(by_priority) == {"Acceso VPN", "Reembolso de viaje"}
    assert by_area_and_status == ["Impresora atascada"]
    assert set(by_assignee) == {"Reembolso de viaje", "Factura duplicada"}
    assert set(by_requester) == {"Acceso VPN", "Factura duplicada"}


async def test_search_by_code_and_title(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    headers = catalog.headers(factory, "admin")
    code = catalog.requests["vpn"].code

    assert await _titles(db_client, headers, {"q": "impresora"}) == ["Impresora atascada"]
    assert await _titles(db_client, headers, {"q": code}) == ["Acceso VPN"]
    assert await _titles(db_client, headers, {"q": "%"}) == []


async def test_overdue_and_date_range_filters(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    headers = catalog.headers(factory, "admin")
    today = utcnow().date()

    overdue = await _titles(db_client, headers, {"overdue": "true"})
    recent = await _titles(
        db_client,
        headers,
        {"received_from": str(today - timedelta(days=5)), "received_to": str(today)},
    )

    assert overdue == ["Impresora atascada"]
    assert set(recent) == {"Acceso VPN", "Reembolso de viaje", "Monitor extra"}


@pytest.mark.parametrize(
    ("sort", "first"),
    [
        ("due_at", "Factura duplicada"),
        ("-priority", "Acceso VPN"),
        ("-received_at", "Reembolso de viaje"),
        ("code", "Impresora atascada"),
    ],
)
async def test_sorting(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog, sort: str, first: str
) -> None:
    titles = await _titles(db_client, catalog.headers(factory, "admin"), {"sort": sort})

    assert titles[0] == first


@pytest.mark.parametrize(("sort", "first_area"), [("area", "Finanzas"), ("-area", "Soporte")])
async def test_sorting_by_area_name(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog, sort: str, first_area: str
) -> None:
    response = await db_client.get(
        "/api/v1/requests", headers=catalog.headers(factory, "admin"), params={"sort": sort}
    )

    areas = [item["area"]["name"] for item in response.json()["items"]]
    assert areas[0] == first_area
    assert areas == sorted(areas, reverse=sort.startswith("-"))


async def test_invalid_sort_is_rejected(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    response = await db_client.get(
        "/api/v1/requests", headers=catalog.headers(factory, "admin"), params={"sort": "drop"}
    )

    assert response.status_code == 422


async def test_sla_indicators(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    response = await db_client.get(
        "/api/v1/requests", headers=catalog.headers(factory, "admin"), params={"size": "100"}
    )

    items = {item["title"]: item for item in response.json()["items"]}
    assert items["Impresora atascada"]["sla_status"] == "overdue"
    assert items["Acceso VPN"]["sla_status"] == "at_risk"
    assert items["Reembolso de viaje"]["sla_status"] == "on_track"
    assert items["Factura duplicada"]["sla_status"] is None
    assert items["Impresora atascada"]["is_stalled"] is True
    assert items["Acceso VPN"]["is_stalled"] is False
    assert items["Factura duplicada"]["is_stalled"] is False


async def test_board_groups_by_status(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    headers = catalog.headers(factory, "admin")

    board = (await db_client.get("/api/v1/requests/board", headers=headers)).json()
    with_cancelled = (
        await db_client.get(
            "/api/v1/requests/board", headers=headers, params=[("status", "cancelled")]
        )
    ).json()

    assert [(c["status"], c["total"]) for c in board["columns"]] == [
        ("received", 1),
        ("assigned", 1),
        ("in_progress", 1),
        ("completed", 1),
    ]
    assert [(c["status"], c["total"]) for c in with_cancelled["columns"]] == [("cancelled", 1)]
    card = board["columns"][2]["items"][0]
    assert {item["to"] for item in card["allowed_transitions"]} == {
        "completed",
        "assigned",
        "cancelled",
    }


async def test_board_limits_each_column_but_reports_the_total(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    for index in range(52):
        await factory.request(
            area=catalog.support, requester=catalog.people["carla"], title=f"Lote {index}"
        )

    board = (
        await db_client.get("/api/v1/requests/board", headers=catalog.headers(factory, "admin"))
    ).json()

    received = board["columns"][0]
    assert received["total"] == 53
    assert len(received["items"]) == 50


async def test_due_estimates(
    db_client: httpx2.AsyncClient, factory: Factory, catalog: Catalog
) -> None:
    response = await db_client.get(
        "/api/v1/requests/due-estimates", headers=catalog.headers(factory, "carla")
    )

    assert response.json() == [
        {"priority": "critical", "hours": None},
        {"priority": "high", "hours": sum(HIGH_HOURS)},
        {"priority": "medium", "hours": None},
        {"priority": "low", "hours": None},
    ]
