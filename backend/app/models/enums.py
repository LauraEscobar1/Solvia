from enum import StrEnum


class RequestStatus(StrEnum):
    RECEIVED = "received"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class RequestPriority(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class UserRole(StrEnum):
    ADMIN = "admin"
    SUPERVISOR = "supervisor"
    ASSIGNEE = "assignee"
    REQUESTER = "requester"


class UILanguage(StrEnum):
    ES = "es"
    EN = "en"


class UITheme(StrEnum):
    LIGHT = "light"
    DARK = "dark"
    SYSTEM = "system"


class RequestEventType(StrEnum):
    CREATED = "created"
    STATUS_CHANGED = "status_changed"
    ASSIGNED = "assigned"
    COMMENT = "comment"
    UPDATED = "updated"


class AlertType(StrEnum):
    DUE_SOON = "due_soon"
    OVERDUE = "overdue"
    STALLED = "stalled"
    BOTTLENECK = "bottleneck"


class AlertSeverity(StrEnum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"


class AlertSource(StrEnum):
    RULE = "rule"
    AI = "ai"


class InsightScope(StrEnum):
    REQUEST = "request"
    AREA = "area"
    GLOBAL = "global"


class SlaStatus(StrEnum):
    ON_TRACK = "on_track"
    AT_RISK = "at_risk"
    OVERDUE = "overdue"


SLA_STAGES: tuple[RequestStatus, ...] = (
    RequestStatus.RECEIVED,
    RequestStatus.ASSIGNED,
    RequestStatus.IN_PROGRESS,
)

CLOSED_STATUSES: frozenset[RequestStatus] = frozenset(
    {RequestStatus.COMPLETED, RequestStatus.CANCELLED}
)
