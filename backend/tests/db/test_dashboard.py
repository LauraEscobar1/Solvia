from collections.abc import Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx2
import pytest
import time_machine

from app.models import Area, ServiceRequest, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
from tests.db.conftest import Factory

NOW = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)
HIGH_HOURS = (8, 24, 72)
HIGH_RISK = 70
RANGE = {"date_from": "2026-09-16", "date_to": "2026-10-15", "timezone": "America/Bogota"}


@dataclass
class Data:
    support: Area
    finance: Area
    people: dict[str, User]
    requests: dict[str, ServiceRequest]

    def headers(self, factory: Factory, actor: str) -> dict[str, str]:
        return factory.auth_headers(self.people[actor])


@pytest.fixture
def frozen() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture
async def data(factory: Factory, frozen: time_machine.Traveller) -> Data:
    support = await factory.area("Soporte")
    finance = await factory.area("Finanzas")
    await factory.sla_matrix({RequestPriority.HIGH: HIGH_HOURS})
    people = {
        "admin": await factory.user(UserRole.ADMIN),
        "supervisor": await factory.user(UserRole.SUPERVISOR, area=support),
        "assignee": await factory.user(UserRole.ASSIGNEE, area=support),
        "carla": await factory.user(UserRole.REQUESTER),
        "diego": await factory.user(UserRole.REQUESTER),
    }

    async def make(area: Area, requester: str, **values: Any) -> ServiceRequest:
        return await factory.request(
            area=area, requester=people[requester], priority=RequestPriority.HIGH, **values
        )

    requests = {
        "fresh": await make(
            support,
            "carla",
            received_at=NOW - timedelta(hours=2),
            due_at=NOW + timedelta(hours=102),
        ),
        "due_soon": await make(
            support,
            "diego",
            status=RequestStatus.IN_PROGRESS,
            assignee=people["assignee"],
            received_at=NOW - timedelta(hours=100),
            due_at=NOW + timedelta(hours=4),
            last_activity_at=NOW - timedelta(hours=1),
        ),
        "overdue": await make(
            support,
            "carla",
            status=RequestStatus.ASSIGNED,
            assignee=people["assignee"],
            received_at=NOW - timedelta(hours=50),
            due_at=NOW - timedelta(hours=10),
        ),
        "recent_done": await make(
            finance,
            "carla",
            status=RequestStatus.COMPLETED,
            received_at=NOW - timedelta(days=3),
            completed_at=NOW - timedelta(days=1),
        ),
        "old_done": await make(
            finance,
            "diego",
            status=RequestStatus.COMPLETED,
            received_at=NOW - timedelta(days=20),
            completed_at=NOW - timedelta(days=10),
        ),
        "cancelled": await make(
            support,
            "diego",
            status=RequestStatus.CANCELLED,
            received_at=NOW - timedelta(days=5),
        ),
    }
    return Data(support, finance, people, requests)


async def _get(
    client: httpx2.AsyncClient,
    path: str,
    headers: dict[str, str],
    params: dict[str, str] | None = None,
) -> Any:
    response = await client.get(f"/api/v1/dashboard/{path}", headers=headers, params=params)
    assert response.status_code == 200, response.text
    return response.json()


async def test_summary_has_known_values(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    summary = await _get(db_client, "summary", data.headers(factory, "admin"))
    for derived in ("high_risk", "due_soon_high_risk", "stalled_forgotten"):
        summary.pop(derived)

    assert summary == {
        "open": 3,
        "due_soon": 1,
        "overdue": 1,
        "stalled": 1,
        "completed_last_7_days": 1,
        "completed_since": "2026-10-09",
        "avg_resolution_hours": 144.0,
        "open_areas": 1,
        "overdue_change": 1,
        "open_by_stage": {"received": 1, "assigned": 1, "in_progress": 1},
        "range": RANGE,
    }


async def test_summary_risk_counts_match_the_request_list(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    headers = data.headers(factory, "admin")
    summary = await _get(db_client, "summary", headers)
    response = await db_client.get("/api/v1/requests", headers=headers, params={"size": 100})
    items = [item for item in response.json()["items"] if item["risk_score"] is not None]
    high = [item for item in items if item["risk_score"] >= HIGH_RISK]

    assert summary["high_risk"] == len(high) >= 1
    assert summary["due_soon_high_risk"] == sum(item["sla_status"] == "at_risk" for item in high)
    assert summary["stalled_forgotten"] == sum(
        item["is_stalled"] and (item["assignee"] is None or item["risk_score"] >= HIGH_RISK)
        for item in items
    )
    assert summary["stalled_forgotten"] >= 1


async def test_overdue_change_uses_the_status_history(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    received = NOW - timedelta(days=5)
    closed = await factory.request(
        area=data.support,
        requester=data.people["carla"],
        priority=RequestPriority.HIGH,
        status=RequestStatus.COMPLETED,
        received_at=received,
        due_at=NOW - timedelta(days=3),
        completed_at=NOW - timedelta(hours=2),
    )
    await factory.stage_change(closed, to_status=RequestStatus.RECEIVED, at=received)
    await factory.stage_change(
        closed,
        from_status=RequestStatus.RECEIVED,
        to_status=RequestStatus.COMPLETED,
        at=NOW - timedelta(hours=2),
    )
    headers = data.headers(factory, "admin")

    summary = await _get(db_client, "summary", headers)

    assert summary["overdue"] == 1
    assert summary["overdue_change"] == 0


@pytest.mark.parametrize(
    ("actor", "params", "expected"),
    [
        ("supervisor", None, (3, 1, 1, 0, None)),
        ("assignee", None, (3, 1, 1, 0, None)),
        ("carla", None, (2, 0, 1, 1, 48.0)),
        ("diego", None, (1, 1, 0, 0, 240.0)),
        ("admin", "finance", (0, 0, 0, 1, 144.0)),
        ("supervisor", "finance", (0, 0, 0, 0, None)),
    ],
)
async def test_summary_respects_role_scope_and_area_filter(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    data: Data,
    actor: str,
    params: str | None,
    expected: tuple[int, int, int, int, float | None],
) -> None:
    query = {"area_id": str(data.finance.id)} if params else None

    summary = await _get(db_client, "summary", data.headers(factory, actor), query)

    assert (
        summary["open"],
        summary["due_soon"],
        summary["overdue"],
        summary["completed_last_7_days"],
        summary["avg_resolution_hours"],
    ) == expected


async def test_by_status_counts_requests_received_in_the_range(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    headers = data.headers(factory, "admin")

    full = await _get(db_client, "by-status", headers)
    narrow = await _get(
        db_client, "by-status", headers, {"date_from": "2026-10-13", "date_to": "2026-10-15"}
    )

    assert full["items"] == [
        {"status": "received", "count": 1},
        {"status": "assigned", "count": 1},
        {"status": "in_progress", "count": 1},
        {"status": "completed", "count": 2},
        {"status": "cancelled", "count": 1},
    ]
    assert {item["status"]: item["count"] for item in narrow["items"]} == {
        "received": 1,
        "assigned": 1,
        "in_progress": 0,
        "completed": 0,
        "cancelled": 0,
    }


async def test_at_risk_lists_overdue_first_then_by_sla_consumed(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    at_risk = await _get(db_client, "at-risk", data.headers(factory, "admin"))
    stalled = await _get(db_client, "stalled", data.headers(factory, "admin"))

    assert [
        (item["code"], item["sla_status"], item["consumed_pct"]) for item in at_risk["items"]
    ] == [
        (data.requests["overdue"].code, "overdue", 125),
        (data.requests["due_soon"].code, "at_risk", 96),
    ]
    assert [(item["code"], item["idle_hours"]) for item in stalled["items"]] == [
        (data.requests["overdue"].code, 50.0)
    ]
    assert stalled["items"][0]["inactivity_hours"] == 12
    assert at_risk["items"][0]["area"] == {"id": str(data.support.id), "name": "Soporte"}


async def test_highlights_are_limited_to_twenty(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    for index in range(25):
        await factory.request(
            area=data.support,
            requester=data.people["carla"],
            priority=RequestPriority.HIGH,
            received_at=NOW - timedelta(hours=60 + index),
            due_at=NOW - timedelta(hours=1),
        )

    at_risk = await _get(db_client, "at-risk", data.headers(factory, "admin"))
    stalled = await _get(db_client, "stalled", data.headers(factory, "admin"))

    assert len(at_risk["items"]) == len(stalled["items"]) == 20
    idle = [item["idle_hours"] for item in stalled["items"]]
    assert idle == sorted(idle, reverse=True)


@pytest.mark.parametrize(
    ("actor", "areas"),
    [("admin", {"Soporte", "Finanzas"}), ("supervisor", {"Soporte"}), ("carla", set())],
)
async def test_bottleneck_matrix_by_role(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data, actor: str, areas: set[str]
) -> None:
    matrix = await _get(db_client, "bottlenecks", data.headers(factory, actor))

    assert {cell["area"]["name"] for cell in matrix["cells"]} == areas
    assert len(matrix["cells"]) == 3 * len(areas)
    for cell in matrix["cells"]:
        assert set(cell) == {
            "area",
            "status",
            "count",
            "avg_hours",
            "median_count",
            "median_avg_hours",
            "sla_max_hours",
            "is_bottleneck",
            "reasons",
        }


async def test_by_area_reports_open_overdue_and_resolution(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    by_area = await _get(db_client, "by-area", data.headers(factory, "admin"))

    assert by_area["items"] == [
        {
            "area": {"id": str(data.finance.id), "name": "Finanzas"},
            "open": 0,
            "overdue": 0,
            "avg_resolution_hours": 144.0,
        },
        {
            "area": {"id": str(data.support.id), "name": "Soporte"},
            "open": 3,
            "overdue": 1,
            "avg_resolution_hours": None,
        },
    ]


async def test_trends_group_days_in_the_organization_timezone_near_midnight(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    late = datetime(2026, 10, 15, 4, 30, tzinfo=UTC)
    early = datetime(2026, 10, 15, 5, 30, tzinfo=UTC)
    await factory.request(
        area=data.finance, requester=data.people["diego"], title="Tarde", received_at=late
    )
    await factory.request(
        area=data.finance, requester=data.people["diego"], title="Temprano", received_at=early
    )
    await factory.request(
        area=data.finance,
        requester=data.people["diego"],
        status=RequestStatus.COMPLETED,
        received_at=datetime(2026, 10, 13, 16, 30, tzinfo=UTC),
        completed_at=datetime(2026, 10, 15, 4, 59, tzinfo=UTC),
    )
    headers = data.headers(factory, "admin")

    trends = await _get(
        db_client,
        "trends",
        headers,
        {"area_id": str(data.finance.id), "date_from": "2026-10-13", "date_to": "2026-10-15"},
    )
    listed = await db_client.get(
        "/api/v1/requests",
        headers=headers,
        params={"received_from": "2026-10-15", "area_id": str(data.finance.id)},
    )

    assert trends["days"] == [
        {"day": "2026-10-13", "created": 1, "completed": 0},
        {"day": "2026-10-14", "created": 1, "completed": 2},
        {"day": "2026-10-15", "created": 1, "completed": 0},
    ]
    assert trends["range"] == {
        "date_from": "2026-10-13",
        "date_to": "2026-10-15",
        "timezone": "America/Bogota",
    }
    assert [item["title"] for item in listed.json()["items"]] == ["Temprano"]


async def test_trends_cover_thirty_days_by_default(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data
) -> None:
    trends = await _get(db_client, "trends", data.headers(factory, "admin"))

    assert len(trends["days"]) == 30
    assert trends["days"][0]["day"] == "2026-09-16"
    assert trends["days"][-1]["day"] == "2026-10-15"
    assert sum(day["created"] for day in trends["days"]) == 6
    assert sum(day["completed"] for day in trends["days"]) == 2


@pytest.mark.parametrize(
    "params",
    [
        {"date_from": "2026-10-10", "date_to": "2026-10-01"},
        {"date_from": "2024-01-01", "date_to": "2026-10-01"},
        {"date_from": "2026-12-01"},
    ],
)
async def test_invalid_date_ranges_are_rejected(
    db_client: httpx2.AsyncClient, factory: Factory, data: Data, params: dict[str, str]
) -> None:
    response = await db_client.get(
        "/api/v1/dashboard/summary", headers=data.headers(factory, "admin"), params=params
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "common.validation_error"


async def test_dashboard_requires_authentication(db_client: httpx2.AsyncClient) -> None:
    response = await db_client.get("/api/v1/dashboard/summary")

    assert response.status_code == 401
