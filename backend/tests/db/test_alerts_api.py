import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import httpx2
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import utcnow
from app.models import Alert, Area, ServiceRequest, User
from app.models.enums import AlertSeverity, AlertSource, AlertType, UserRole
from tests.db.conftest import Factory


@dataclass
class World:
    support: Area
    finance: Area
    people: dict[str, User]
    requests: dict[str, ServiceRequest]
    alerts: dict[str, Alert]

    def headers(self, factory: Factory, actor: str) -> dict[str, str]:
        return factory.auth_headers(self.people[actor])


def _alert(
    area: Area,
    alert_type: AlertType,
    severity: AlertSeverity,
    *,
    request: ServiceRequest | None = None,
    **values: Any,
) -> Alert:
    params: dict[str, Any] = (
        {"code": request.code} if request else {"area_id": str(area.id), "status": "received"}
    )
    return Alert(
        area_id=area.id,
        request_id=request.id if request else None,
        type=alert_type,
        severity=severity,
        source=AlertSource.RULE,
        message_code=f"alert.{alert_type.value}",
        params=params,
        **values,
    )


@pytest.fixture
async def world(session: AsyncSession, factory: Factory) -> World:
    support = await factory.area("Soporte")
    finance = await factory.area("Finanzas")
    people = {
        "admin": await factory.user(UserRole.ADMIN),
        "supervisor": await factory.user(UserRole.SUPERVISOR, area=support),
        "finance_assignee": await factory.user(UserRole.ASSIGNEE, area=finance),
        "carla": await factory.user(UserRole.REQUESTER),
        "diego": await factory.user(UserRole.REQUESTER),
    }
    requests = {
        "printer": await factory.request(
            area=support, requester=people["carla"], title="Impresora"
        ),
        "refund": await factory.request(area=finance, requester=people["diego"], title="Reembolso"),
    }
    now = utcnow()
    alerts = {
        "printer_overdue": _alert(
            support,
            AlertType.OVERDUE,
            AlertSeverity.CRITICAL,
            request=requests["printer"],
            created_at=now - timedelta(minutes=5),
        ),
        "printer_stalled_old": _alert(
            support,
            AlertType.STALLED,
            AlertSeverity.WARNING,
            request=requests["printer"],
            created_at=now - timedelta(days=2),
            resolved_at=now - timedelta(days=1),
        ),
        "refund_stalled": _alert(
            finance,
            AlertType.STALLED,
            AlertSeverity.WARNING,
            request=requests["refund"],
            created_at=now - timedelta(minutes=10),
        ),
        "support_bottleneck": _alert(
            support, AlertType.BOTTLENECK, AlertSeverity.CRITICAL, created_at=now
        ),
        "finance_bottleneck": _alert(
            finance,
            AlertType.BOTTLENECK,
            AlertSeverity.WARNING,
            created_at=now - timedelta(minutes=1),
        ),
    }
    session.add_all(alerts.values())
    await session.commit()
    return World(support, finance, people, requests, alerts)


async def _ids(
    client: httpx2.AsyncClient,
    headers: dict[str, str],
    params: list[tuple[str, str]] | None = None,
) -> list[uuid.UUID]:
    response = await client.get("/api/v1/alerts", headers=headers, params=tuple(params or []))
    assert response.status_code == 200, response.text
    return [uuid.UUID(item["id"]) for item in response.json()["items"]]


def _expected(world: World, *names: str) -> list[uuid.UUID]:
    return [world.alerts[name].id for name in names]


@pytest.mark.parametrize(
    ("actor", "visible"),
    [
        (
            "admin",
            [
                "support_bottleneck",
                "finance_bottleneck",
                "printer_overdue",
                "refund_stalled",
                "printer_stalled_old",
            ],
        ),
        ("supervisor", ["support_bottleneck", "printer_overdue", "printer_stalled_old"]),
        ("finance_assignee", ["finance_bottleneck", "refund_stalled"]),
        ("carla", ["printer_overdue", "printer_stalled_old"]),
        ("diego", ["refund_stalled"]),
    ],
)
async def test_alerts_follow_the_role_scope(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    world: World,
    actor: str,
    visible: list[str],
) -> None:
    assert await _ids(db_client, world.headers(factory, actor)) == _expected(world, *visible)


async def test_alert_payload_has_codes_params_area_and_request(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    response = await db_client.get(
        "/api/v1/alerts", headers=world.headers(factory, "carla"), params={"size": "1"}
    )

    body = response.json()
    assert body["total"] == 2
    assert body["page"] == 1
    assert body["size"] == 1
    item = body["items"][0]
    request = world.requests["printer"]
    assert item["message_code"] == "alert.overdue"
    assert item["params"] == {"code": request.code}
    assert item["area"] == {"id": str(world.support.id), "name": "Soporte"}
    assert item["request"] == {
        "id": str(request.id),
        "code": request.code,
        "title": "Impresora",
        "status": "received",
    }
    assert item["is_read"] is False
    assert item["resolved_at"] is None


async def test_filters_by_type_severity_state_read_and_code(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    headers = world.headers(factory, "admin")
    code = world.requests["refund"].code

    by_type = await _ids(db_client, headers, [("type", "bottleneck")])
    by_severity = await _ids(db_client, headers, [("severity", "critical")])
    open_only = await _ids(db_client, headers, [("state", "open"), ("type", "stalled")])
    resolved = await _ids(db_client, headers, [("state", "resolved")])
    by_code = await _ids(db_client, headers, [("q", code)])

    assert by_type == _expected(world, "support_bottleneck", "finance_bottleneck")
    assert by_severity == _expected(world, "support_bottleneck", "printer_overdue")
    assert open_only == _expected(world, "refund_stalled")
    assert resolved == _expected(world, "printer_stalled_old")
    assert by_code == _expected(world, "refund_stalled")


async def test_read_state_is_per_user(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    admin = world.headers(factory, "admin")
    supervisor = world.headers(factory, "supervisor")
    alert_id = world.alerts["printer_overdue"].id

    before = (await db_client.get("/api/v1/alerts/unread-count", headers=admin)).json()
    marked = await db_client.patch(f"/api/v1/alerts/{alert_id}/read", headers=admin)
    again = await db_client.patch(f"/api/v1/alerts/{alert_id}/read", headers=admin)
    after = (await db_client.get("/api/v1/alerts/unread-count", headers=admin)).json()
    supervisor_count = (
        await db_client.get("/api/v1/alerts/unread-count", headers=supervisor)
    ).json()

    assert before == {"count": 4}
    assert marked.status_code == again.status_code == 200
    assert marked.json()["is_read"] is True
    assert after == {"count": 3}
    assert supervisor_count == {"count": 2}
    assert await _ids(db_client, admin, [("is_read", "true")]) == [alert_id]
    assert alert_id not in await _ids(db_client, admin, [("is_read", "false")])
    assert alert_id in await _ids(db_client, supervisor, [("is_read", "false")])


async def test_read_all_marks_only_what_the_user_sees(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    supervisor = world.headers(factory, "supervisor")
    admin = world.headers(factory, "admin")

    response = await db_client.post("/api/v1/alerts/read-all", headers=supervisor)
    repeated = await db_client.post("/api/v1/alerts/read-all", headers=supervisor)

    assert response.json() == {"count": 3}
    assert repeated.json() == {"count": 0}
    assert (await db_client.get("/api/v1/alerts/unread-count", headers=supervisor)).json() == {
        "count": 0
    }
    assert (await db_client.get("/api/v1/alerts/unread-count", headers=admin)).json() == {
        "count": 4
    }


@pytest.mark.parametrize("target", ["foreign", "missing"])
async def test_marking_an_invisible_alert_returns_not_found(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, target: str
) -> None:
    alert_id = world.alerts["refund_stalled"].id if target == "foreign" else uuid.uuid4()

    response = await db_client.patch(
        f"/api/v1/alerts/{alert_id}/read", headers=world.headers(factory, "carla")
    )

    assert response.status_code == 404
    assert response.json() == {"error": {"code": "alert.not_found", "params": {}}}


async def test_manual_evaluation_is_admin_only(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    allowed = await db_client.post(
        "/api/v1/alerts/evaluate", headers=world.headers(factory, "admin")
    )
    denied = await db_client.post(
        "/api/v1/alerts/evaluate", headers=world.headers(factory, "supervisor")
    )

    assert allowed.status_code == 200
    assert set(allowed.json()) == {
        "created",
        "updated",
        "resolved",
        "bottlenecks",
        "skipped",
        "duration_ms",
    }
    assert denied.status_code == 403
