from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

import httpx2
import pytest
from fastapi import FastAPI
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Area, RequestEvent, ServiceRequest, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
from app.repositories.request_event import RequestEventRepository
from tests.db.conftest import Factory
from tests.request_spec import ACTORS, TRANSITION_SPEC, VISIBLE_TO, allowed_for

HIGH_HOURS = (8, 24, 72)
LOW_HOURS = (48, 96, 240)


@dataclass
class World:
    area: Area
    other_area: Area
    people: dict[str, User]
    spare_assignee: User
    outsider_assignee: User

    def headers(self, factory: Factory, actor: str) -> dict[str, str]:
        return factory.auth_headers(self.people[actor])


@pytest.fixture
async def world(factory: Factory) -> World:
    area = await factory.area("Soporte")
    other_area = await factory.area("Finanzas")
    people = {
        "admin": await factory.user(UserRole.ADMIN),
        "supervisor": await factory.user(UserRole.SUPERVISOR, area=area),
        "other_supervisor": await factory.user(UserRole.SUPERVISOR, area=other_area),
        "responsible": await factory.user(UserRole.ASSIGNEE, area=area),
        "area_assignee": await factory.user(UserRole.ASSIGNEE, area=area),
        "requester": await factory.user(UserRole.REQUESTER),
        "other_requester": await factory.user(UserRole.REQUESTER),
    }
    spare = await factory.user(UserRole.ASSIGNEE, area=area)
    outsider = await factory.user(UserRole.ASSIGNEE, area=other_area)
    await factory.sla_matrix({RequestPriority.HIGH: HIGH_HOURS, RequestPriority.LOW: LOW_HOURS})
    return World(area, other_area, people, spare, outsider)


async def _request_in(factory: Factory, world: World, status: RequestStatus) -> ServiceRequest:
    return await factory.request(
        area=world.area,
        requester=world.people["requester"],
        status=status,
        assignee=None if status is RequestStatus.RECEIVED else world.people["responsible"],
    )


def _url(request: ServiceRequest, suffix: str = "") -> str:
    return f"/api/v1/requests/{request.id}{suffix}"


PAIRS = [(source, target) for source in RequestStatus for target in RequestStatus]


@pytest.mark.parametrize("actor", ACTORS)
@pytest.mark.parametrize(
    ("source", "target"), PAIRS, ids=[f"{s.value}->{t.value}" for s, t in PAIRS]
)
async def test_transition_matrix(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    world: World,
    actor: str,
    source: RequestStatus,
    target: RequestStatus,
) -> None:
    request = await _request_in(factory, world, source)
    body: dict[str, Any] = {"to": target.value, "version": 1, "comment": "Motivo del cambio"}
    if source is RequestStatus.RECEIVED:
        body["assignee_id"] = str(world.spare_assignee.id)

    response = await db_client.post(
        _url(request, "/transition"), headers=world.headers(factory, actor), json=body
    )

    spec = TRANSITION_SPEC.get((source, target))
    if actor not in VISIBLE_TO:
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "request.not_found"
    elif spec is None:
        assert response.status_code == 409
        assert response.json()["error"] == {
            "code": "request.invalid_transition",
            "params": {"from": source.value, "to": target.value},
        }
    elif actor not in spec[0]:
        assert response.status_code == 403
    else:
        assert response.status_code == 200, response.text
        assert response.json()["status"] == target.value
        assert response.json()["version"] == 2


@pytest.mark.parametrize("status", list(RequestStatus))
@pytest.mark.parametrize("actor", ACTORS)
async def test_detail_exposes_allowed_transitions(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    world: World,
    actor: str,
    status: RequestStatus,
) -> None:
    request = await _request_in(factory, world, status)

    response = await db_client.get(_url(request), headers=world.headers(factory, actor))

    if actor not in VISIBLE_TO:
        assert response.status_code == 404
        return
    allowed = {item["to"] for item in response.json()["allowed_transitions"]}
    assert allowed == {target.value for target in allowed_for(actor, status)}
    for item in response.json()["allowed_transitions"]:
        _, requires_comment, requires_assignee = TRANSITION_SPEC[
            (status, RequestStatus(item["to"]))
        ]
        assert item["requires_comment"] is requires_comment
        assert item["requires_assignee"] is requires_assignee


COMMENT_REQUIRED = [
    pair for pair, (_, needs_comment, _) in TRANSITION_SPEC.items() if needs_comment
]


@pytest.mark.parametrize("comment", [None, "   "])
@pytest.mark.parametrize(
    ("source", "target"),
    COMMENT_REQUIRED,
    ids=[f"{s.value}->{t.value}" for s, t in COMMENT_REQUIRED],
)
async def test_comment_is_required_where_the_spec_says(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    world: World,
    source: RequestStatus,
    target: RequestStatus,
    comment: str | None,
) -> None:
    request = await _request_in(factory, world, source)
    body: dict[str, Any] = {"to": target.value, "version": 1}
    if comment is not None:
        body["comment"] = comment

    response = await db_client.post(
        _url(request, "/transition"), headers=world.headers(factory, "admin"), json=body
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.comment_required"


async def test_assigning_requires_an_assignee(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    request = await _request_in(factory, world, RequestStatus.RECEIVED)

    response = await db_client.post(
        _url(request, "/transition"),
        headers=world.headers(factory, "supervisor"),
        json={"to": "assigned", "version": 1},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.assignee_required"


@pytest.mark.parametrize("path", ["/assign", "/transition"])
async def test_both_assignment_paths_apply_the_same_rules(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, path: str
) -> None:
    request = await _request_in(factory, world, RequestStatus.RECEIVED)
    body: dict[str, Any] = {"assignee_id": str(world.outsider_assignee.id), "version": 1}
    if path == "/transition":
        body["to"] = "assigned"

    rejected = await db_client.post(
        _url(request, path), headers=world.headers(factory, "supervisor"), json=body
    )
    body["assignee_id"] = str(world.spare_assignee.id)
    accepted = await db_client.post(
        _url(request, path), headers=world.headers(factory, "supervisor"), json=body
    )

    assert rejected.status_code == 422
    assert rejected.json()["error"]["code"] == "request.invalid_assignee"
    assert accepted.status_code == 200
    assert accepted.json()["status"] == "assigned"
    assert accepted.json()["assignee"]["id"] == str(world.spare_assignee.id)


async def test_admin_can_assign_outside_the_area_and_it_is_recorded(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, session: AsyncSession
) -> None:
    request = await _request_in(factory, world, RequestStatus.RECEIVED)

    response = await db_client.post(
        _url(request, "/assign"),
        headers=world.headers(factory, "admin"),
        json={"assignee_id": str(world.outsider_assignee.id), "version": 1},
    )

    assert response.status_code == 200
    event = await session.scalar(
        select(RequestEvent).where(
            RequestEvent.request_id == request.id, RequestEvent.type == "assigned"
        )
    )
    assert event is not None
    assert event.details["area_override"] is True
    assert event.details["assignee_name"] == world.outsider_assignee.full_name


@pytest.mark.parametrize("candidate", ["inactive", "requester"])
async def test_only_active_assignees_or_supervisors_can_be_assigned(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, candidate: str
) -> None:
    request = await _request_in(factory, world, RequestStatus.RECEIVED)
    user = (
        await factory.user(UserRole.ASSIGNEE, area=world.area, is_active=False)
        if candidate == "inactive"
        else await factory.user(UserRole.REQUESTER)
    )

    response = await db_client.post(
        _url(request, "/assign"),
        headers=world.headers(factory, "admin"),
        json={"assignee_id": str(user.id), "version": 1},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "request.invalid_assignee"


async def test_returning_clears_the_assignee_and_records_who_and_why(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, session: AsyncSession
) -> None:
    request = await _request_in(factory, world, RequestStatus.ASSIGNED)

    response = await db_client.post(
        _url(request, "/transition"),
        headers=world.headers(factory, "responsible"),
        json={"to": "received", "version": 1, "comment": "No es de mi área"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "received"
    assert response.json()["assignee"] is None
    event = await session.scalar(select(RequestEvent).where(RequestEvent.request_id == request.id))
    assert event is not None
    responsible = world.people["responsible"]
    assert event.details == {
        "returned_by": str(responsible.id),
        "returned_by_name": responsible.full_name,
        "reason": "No es de mi área",
        "previous_assignee_id": str(responsible.id),
        "previous_assignee_name": responsible.full_name,
    }


async def test_reassigning_keeps_the_status(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    request = await _request_in(factory, world, RequestStatus.IN_PROGRESS)

    response = await db_client.post(
        _url(request, "/assign"),
        headers=world.headers(factory, "supervisor"),
        json={"assignee_id": str(world.spare_assignee.id), "version": 1},
    )
    events = await db_client.get(_url(request, "/events"), headers=world.headers(factory, "admin"))

    assert response.json()["status"] == "in_progress"
    assert response.json()["assignee"]["id"] == str(world.spare_assignee.id)
    latest = events.json()["items"][0]
    assert latest["type"] == "assigned"
    assert latest["details"]["previous_assignee_name"] == world.people["responsible"].full_name


async def test_completing_and_reopening_manage_completed_at(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    request = await _request_in(factory, world, RequestStatus.IN_PROGRESS)
    headers = world.headers(factory, "supervisor")

    completed = await db_client.post(
        _url(request, "/transition"), headers=headers, json={"to": "completed", "version": 1}
    )
    reopened = await db_client.post(
        _url(request, "/transition"),
        headers=headers,
        json={"to": "in_progress", "version": 2, "comment": "Volvió a fallar"},
    )

    assert completed.json()["completed_at"] is not None
    assert reopened.json()["completed_at"] is None


@pytest.mark.parametrize("status", [RequestStatus.COMPLETED, RequestStatus.CANCELLED])
async def test_closed_requests_cannot_be_edited_or_reassigned(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, status: RequestStatus
) -> None:
    request = await _request_in(factory, world, status)
    headers = world.headers(factory, "admin")

    edit = await db_client.patch(_url(request), headers=headers, json={"version": 1, "title": "X"})
    reassign = await db_client.post(
        _url(request, "/assign"),
        headers=headers,
        json={"assignee_id": str(world.spare_assignee.id), "version": 1},
    )

    for response in (edit, reassign):
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "request.closed"


async def test_stale_version_is_rejected(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    request = await _request_in(factory, world, RequestStatus.ASSIGNED)
    headers = world.headers(factory, "supervisor")

    first = await db_client.patch(_url(request), headers=headers, json={"version": 1, "title": "A"})
    second = await db_client.patch(
        _url(request), headers=headers, json={"version": 1, "title": "B"}
    )
    transition = await db_client.post(
        _url(request, "/transition"), headers=headers, json={"to": "in_progress", "version": 1}
    )

    assert first.status_code == 200
    for response in (second, transition):
        assert response.status_code == 409
        assert response.json()["error"] == {
            "code": "request.version_conflict",
            "params": {"current_version": 2},
        }


async def test_due_at_is_computed_from_the_sla_matrix(
    db_client: httpx2.AsyncClient, world: World, factory: Factory
) -> None:
    response = await db_client.post(
        "/api/v1/requests",
        headers=world.headers(factory, "requester"),
        json={
            "title": "Impresora",
            "description": "No imprime",
            "area_id": str(world.area.id),
            "priority": "high",
        },
    )

    body = response.json()
    received = datetime.fromisoformat(body["received_at"])
    due = datetime.fromisoformat(body["due_at"])
    assert response.status_code == 201
    assert body["status"] == "received"
    assert body["code"] == "SOL-0001"
    assert due - received == timedelta(hours=sum(HIGH_HOURS))


async def test_priority_change_recomputes_due_at_and_records_old_and_new_values(
    db_client: httpx2.AsyncClient, world: World, factory: Factory
) -> None:
    created = (
        await db_client.post(
            "/api/v1/requests",
            headers=world.headers(factory, "requester"),
            json={
                "title": "Impresora",
                "description": "No imprime",
                "area_id": str(world.area.id),
                "priority": "high",
            },
        )
    ).json()

    updated = await db_client.patch(
        f"/api/v1/requests/{created['id']}",
        headers=world.headers(factory, "supervisor"),
        json={"version": 1, "priority": "low", "title": "Impresora del piso 2"},
    )
    events = await db_client.get(
        f"/api/v1/requests/{created['id']}/events", headers=world.headers(factory, "admin")
    )

    body = updated.json()
    received = datetime.fromisoformat(body["received_at"])
    assert datetime.fromisoformat(body["due_at"]) - received == timedelta(hours=sum(LOW_HOURS))
    changes = events.json()["items"][0]["details"]["changes"]
    assert changes["priority"] == {"from": "high", "to": "low"}
    assert changes["title"] == {"from": "Impresora", "to": "Impresora del piso 2"}
    assert datetime.fromisoformat(changes["due_at"]["from"]) == datetime.fromisoformat(
        created["due_at"]
    )
    assert datetime.fromisoformat(changes["due_at"]["to"]) == datetime.fromisoformat(body["due_at"])


@pytest.mark.parametrize(
    ("actor", "status", "payload", "expected"),
    [
        ("requester", RequestStatus.RECEIVED, {"title": "Nuevo"}, 200),
        ("requester", RequestStatus.RECEIVED, {"priority": "critical"}, 403),
        ("requester", RequestStatus.ASSIGNED, {"description": "Más detalle"}, 403),
        ("responsible", RequestStatus.IN_PROGRESS, {"title": "Nuevo"}, 403),
        ("area_assignee", RequestStatus.RECEIVED, {"title": "Nuevo"}, 403),
        ("supervisor", RequestStatus.IN_PROGRESS, {"due_at": "2030-01-01T00:00:00Z"}, 200),
        ("admin", RequestStatus.ASSIGNED, {"priority": "critical"}, 200),
        ("other_supervisor", RequestStatus.RECEIVED, {"title": "Nuevo"}, 404),
    ],
)
async def test_edit_permissions(
    db_client: httpx2.AsyncClient,
    factory: Factory,
    world: World,
    actor: str,
    status: RequestStatus,
    payload: dict[str, Any],
    expected: int,
) -> None:
    request = await _request_in(factory, world, status)

    response = await db_client.patch(
        _url(request), headers=world.headers(factory, actor), json={"version": 1, **payload}
    )

    assert response.status_code == expected, response.text


async def test_failed_event_creation_leaves_the_request_unchanged(
    db_app: FastAPI,
    factory: Factory,
    world: World,
    session: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    request = await _request_in(factory, world, RequestStatus.ASSIGNED)

    async def broken_add(self: RequestEventRepository, instance: RequestEvent) -> RequestEvent:
        raise RuntimeError

    monkeypatch.setattr(RequestEventRepository, "add", broken_add)
    transport = httpx2.ASGITransport(app=db_app, raise_app_exceptions=False)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post(
            _url(request, "/transition"),
            headers=world.headers(factory, "responsible"),
            json={"to": "in_progress", "version": 1},
        )

    stored = await session.get(ServiceRequest, request.id, populate_existing=True)
    events = await session.scalar(
        select(func.count()).select_from(RequestEvent).where(RequestEvent.request_id == request.id)
    )
    assert response.status_code == 500
    assert stored is not None
    assert stored.status is RequestStatus.ASSIGNED
    assert stored.version == 1
    assert events == 0


async def test_comments(
    db_client: httpx2.AsyncClient, factory: Factory, world: World, session: AsyncSession
) -> None:
    request = await _request_in(factory, world, RequestStatus.ASSIGNED)
    before = request.last_activity_at

    own = await db_client.post(
        _url(request, "/comments"),
        headers=world.headers(factory, "requester"),
        json={"comment": "¿Hay novedades?"},
    )
    foreign = await db_client.post(
        _url(request, "/comments"),
        headers=world.headers(factory, "other_requester"),
        json={"comment": "Hola"},
    )
    empty = await db_client.post(
        _url(request, "/comments"),
        headers=world.headers(factory, "requester"),
        json={"comment": "   "},
    )

    assert own.status_code == 201
    assert own.json()["type"] == "comment"
    assert own.json()["actor"]["id"] == str(world.people["requester"].id)
    assert foreign.status_code == 404
    assert empty.status_code == 422
    stored = await session.get(ServiceRequest, request.id, populate_existing=True)
    assert stored is not None
    assert stored.version == 1
    assert stored.last_activity_at > before


async def test_events_are_paginated_newest_first(
    db_client: httpx2.AsyncClient, factory: Factory, world: World
) -> None:
    request = await _request_in(factory, world, RequestStatus.ASSIGNED)
    headers = world.headers(factory, "requester")
    for index in range(3):
        await db_client.post(
            _url(request, "/comments"), headers=headers, json={"comment": f"Comentario {index}"}
        )

    page = await db_client.get(_url(request, "/events"), headers=headers, params={"size": 2})

    body = page.json()
    assert body["total"] == 3
    assert [item["comment"] for item in body["items"]] == ["Comentario 2", "Comentario 1"]
