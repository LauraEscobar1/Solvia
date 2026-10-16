import uuid

import pytest

from app.models import ServiceRequest, User
from app.models.enums import RequestPriority, RequestStatus, UserRole
from app.services.request_policy import Capability, RequestPolicy
from app.services.request_workflow import allowed_transitions
from tests.request_spec import ACTORS, VISIBLE_TO, allowed_for

AREA = uuid.uuid4()
OTHER_AREA = uuid.uuid4()


def _user(role: UserRole, area: uuid.UUID | None = None) -> User:
    return User(
        id=uuid.uuid4(),
        full_name=role.value,
        email=f"{role.value}@example.com",
        password_hash="x",
        role=role,
        area_id=area,
        is_active=True,
    )


@pytest.fixture
def people() -> dict[str, User]:
    return {
        "admin": _user(UserRole.ADMIN),
        "supervisor": _user(UserRole.SUPERVISOR, AREA),
        "other_supervisor": _user(UserRole.SUPERVISOR, OTHER_AREA),
        "responsible": _user(UserRole.ASSIGNEE, AREA),
        "area_assignee": _user(UserRole.ASSIGNEE, AREA),
        "requester": _user(UserRole.REQUESTER),
        "other_requester": _user(UserRole.REQUESTER),
    }


def _request(people: dict[str, User], status: RequestStatus) -> ServiceRequest:
    return ServiceRequest(
        id=uuid.uuid4(),
        title="t",
        description="d",
        area_id=AREA,
        requester_id=people["requester"].id,
        assignee_id=None if status is RequestStatus.RECEIVED else people["responsible"].id,
        priority=RequestPriority.MEDIUM,
        status=status,
    )


@pytest.mark.parametrize("status", list(RequestStatus))
@pytest.mark.parametrize("actor", ACTORS)
def test_allowed_transitions_follow_the_spec(
    people: dict[str, User], actor: str, status: RequestStatus
) -> None:
    request = _request(people, status)

    allowed = {item.to for item in allowed_transitions(RequestPolicy(people[actor]), request)}

    assert allowed == allowed_for(actor, status)


@pytest.mark.parametrize("actor", [*ACTORS, "other_requester"])
def test_visibility_by_role(people: dict[str, User], actor: str) -> None:
    request = _request(people, RequestStatus.ASSIGNED)

    assert RequestPolicy(people[actor]).can(Capability.VIEW, request) is (actor in VISIBLE_TO)


def test_supervisor_of_the_area_has_every_capability(people: dict[str, User]) -> None:
    request = _request(people, RequestStatus.ASSIGNED)

    assert RequestPolicy(people["supervisor"]).capabilities(request) == frozenset(Capability)
    assert RequestPolicy(people["admin"]).capabilities(request) == frozenset(Capability)
    assert RequestPolicy(people["other_supervisor"]).capabilities(request) == frozenset()


def test_responsible_works_and_comments_but_does_not_edit_or_assign(
    people: dict[str, User],
) -> None:
    request = _request(people, RequestStatus.IN_PROGRESS)

    granted = RequestPolicy(people["responsible"]).capabilities(request)

    assert granted == {Capability.VIEW, Capability.COMMENT, Capability.WORK}
    assert RequestPolicy(people["area_assignee"]).capabilities(request) == {
        Capability.VIEW,
        Capability.COMMENT,
    }


@pytest.mark.parametrize(
    ("actor", "status", "expected"),
    [
        ("requester", RequestStatus.RECEIVED, {"title", "description"}),
        ("requester", RequestStatus.ASSIGNED, set()),
        ("responsible", RequestStatus.IN_PROGRESS, set()),
        ("area_assignee", RequestStatus.RECEIVED, set()),
        ("supervisor", RequestStatus.RECEIVED, {"title", "description", "priority", "due_at"}),
        ("admin", RequestStatus.IN_PROGRESS, {"title", "description", "priority", "due_at"}),
        ("admin", RequestStatus.COMPLETED, set()),
        ("supervisor", RequestStatus.CANCELLED, set()),
    ],
)
def test_editable_fields(
    people: dict[str, User], actor: str, status: RequestStatus, expected: set[str]
) -> None:
    request = _request(people, status)

    assert RequestPolicy(people[actor]).editable_fields(request) == expected


def test_requester_never_edits_priority(people: dict[str, User]) -> None:
    request = _request(people, RequestStatus.RECEIVED)

    assert not RequestPolicy(people["requester"]).can(Capability.EDIT_PRIORITY, request)


@pytest.mark.parametrize(
    ("actor", "everything", "area", "include_assigned"),
    [
        ("admin", True, None, False),
        ("supervisor", False, AREA, True),
        ("responsible", False, AREA, True),
        ("requester", False, None, False),
    ],
)
def test_list_scope_by_role(
    people: dict[str, User],
    actor: str,
    everything: bool,
    area: uuid.UUID | None,
    include_assigned: bool,
) -> None:
    scope = RequestPolicy(people[actor]).scope()

    assert scope.everything is everything
    assert scope.user_id == people[actor].id
    assert scope.area_id == area
    assert scope.include_assigned is include_assigned
