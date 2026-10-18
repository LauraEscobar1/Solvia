from collections.abc import Iterator
from datetime import UTC, datetime, timedelta

import httpx2
import pytest
import time_machine

from app.models.enums import RequestStatus, UserRole
from tests.db.conftest import Factory

NOW = datetime(2026, 10, 15, 20, 0, tzinfo=UTC)
START = NOW - timedelta(hours=30)


@pytest.fixture
def frozen() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


async def test_stage_times_add_up_visits_and_count_the_current_stage_until_now(
    db_client: httpx2.AsyncClient, factory: Factory, frozen: time_machine.Traveller
) -> None:
    area = await factory.area("Soporte")
    requester = await factory.user(UserRole.REQUESTER)
    request = await factory.request(
        area=area, requester=requester, status=RequestStatus.ASSIGNED, received_at=START
    )
    steps = [
        (None, RequestStatus.RECEIVED, START),
        (RequestStatus.RECEIVED, RequestStatus.ASSIGNED, START + timedelta(hours=2)),
        (RequestStatus.ASSIGNED, RequestStatus.IN_PROGRESS, START + timedelta(hours=10)),
        (RequestStatus.IN_PROGRESS, RequestStatus.ASSIGNED, START + timedelta(hours=20)),
    ]
    for from_status, to_status, at in steps:
        await factory.stage_change(request, from_status=from_status, to_status=to_status, at=at)

    response = await db_client.get(
        f"/api/v1/requests/{request.id}/stages", headers=factory.auth_headers(requester)
    )

    assert response.status_code == 200
    body = response.json()
    assert body["current"] == "assigned"
    assert [(stage["status"], stage["hours"], stage["visits"]) for stage in body["stages"]] == [
        ("received", 2.0, 1),
        ("assigned", 18.0, 2),
        ("in_progress", 10.0, 1),
    ]


async def test_closed_requests_stop_counting_and_others_cannot_see_them(
    db_client: httpx2.AsyncClient, factory: Factory, frozen: time_machine.Traveller
) -> None:
    area = await factory.area("Soporte")
    requester = await factory.user(UserRole.REQUESTER)
    stranger = await factory.user(UserRole.REQUESTER)
    request = await factory.request(
        area=area, requester=requester, status=RequestStatus.COMPLETED, received_at=START
    )
    await factory.stage_change(request, to_status=RequestStatus.RECEIVED, at=START)
    await factory.stage_change(
        request,
        from_status=RequestStatus.RECEIVED,
        to_status=RequestStatus.COMPLETED,
        at=START + timedelta(hours=5),
    )

    own = await db_client.get(
        f"/api/v1/requests/{request.id}/stages", headers=factory.auth_headers(requester)
    )
    foreign = await db_client.get(
        f"/api/v1/requests/{request.id}/stages", headers=factory.auth_headers(stranger)
    )

    assert [(stage["status"], stage["hours"]) for stage in own.json()["stages"]] == [
        ("received", 5.0),
        ("completed", 0.0),
    ]
    assert foreign.status_code == 404
