from app.models.enums import RequestStatus

R = RequestStatus.RECEIVED
A = RequestStatus.ASSIGNED
P = RequestStatus.IN_PROGRESS
C = RequestStatus.COMPLETED
X = RequestStatus.CANCELLED

SUPERVISION = frozenset({"admin", "supervisor"})
WORKERS = frozenset({"admin", "supervisor", "responsible"})

ACTORS = ("admin", "supervisor", "other_supervisor", "responsible", "area_assignee", "requester")
VISIBLE_TO = frozenset({"admin", "supervisor", "responsible", "area_assignee", "requester"})

TRANSITION_SPEC: dict[tuple[RequestStatus, RequestStatus], tuple[frozenset[str], bool, bool]] = {
    (R, A): (SUPERVISION, False, True),
    (A, R): (WORKERS, True, False),
    (A, P): (WORKERS, False, False),
    (P, C): (WORKERS, False, False),
    (P, A): (WORKERS, True, False),
    (R, X): (SUPERVISION, True, False),
    (A, X): (SUPERVISION, True, False),
    (P, X): (SUPERVISION, True, False),
    (C, P): (SUPERVISION, True, False),
}


def allowed_for(actor: str, status: RequestStatus) -> set[RequestStatus]:
    return {
        target
        for (source, target), (who, _, _) in TRANSITION_SPEC.items()
        if source is status and actor in who
    }
