from enum import StrEnum


class RequestStatus(StrEnum):
    RECEIVED = "received"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
