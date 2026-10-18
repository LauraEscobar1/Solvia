import uuid
from datetime import date, datetime
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, JsonValue, StringConstraints

from app.models.enums import RequestEventType, RequestPriority, RequestStatus, SlaStatus
from app.schemas.area import UserRef
from app.schemas.common import SearchText
from app.schemas.user import AreaRef

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
CommentText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
OptionalComment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
Version = Annotated[int, Field(ge=1)]


class AssignmentSuggestion(BaseModel):
    assignee: UserRef
    open_count: int
    current_open_count: int | None


class AssignmentSuggestionRead(BaseModel):
    suggestion: AssignmentSuggestion | None


class RequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description
    area_id: uuid.UUID
    priority: RequestPriority


class RequestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Version
    title: Title | None = None
    description: Description | None = None
    priority: RequestPriority | None = None
    due_at: AwareDatetime | None = None


class TransitionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to: RequestStatus
    version: Version
    comment: OptionalComment | None = None
    assignee_id: uuid.UUID | None = None


class AssignInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignee_id: uuid.UUID
    version: Version
    comment: OptionalComment | None = None


class CommentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comment: CommentText


SORT_PATTERN = (
    r"^-?(code|title|area|assignee|priority|status|due_at|last_activity_at|received_at|risk_score)$"
)


class RequestFilters(BaseModel):
    status: list[RequestStatus] = Field(default_factory=list)
    priority: list[RequestPriority] = Field(default_factory=list)
    area_id: uuid.UUID | None = None
    assignee_id: uuid.UUID | None = None
    requester_id: uuid.UUID | None = None
    q: SearchText | None = None
    overdue: bool | None = None
    sla_status: SlaStatus | None = None
    stalled: bool | None = None
    min_risk: int | None = Field(default=None, ge=0, le=100)
    received_from: date | None = None
    received_to: date | None = None
    completed_from: date | None = None
    completed_to: date | None = None


class RequestListQuery(RequestFilters):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)
    sort: str = Field(default="-last_activity_at", pattern=SORT_PATTERN)


class EventListQuery(BaseModel):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class RequestSummary(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    area: AreaRef
    requester: UserRef
    assignee: UserRef | None
    priority: RequestPriority
    status: RequestStatus
    received_at: datetime
    due_at: datetime | None
    last_activity_at: datetime
    completed_at: datetime | None
    version: int
    sla_status: SlaStatus | None
    is_stalled: bool
    risk_score: int | None


class AllowedTransitionRead(BaseModel):
    to: RequestStatus
    requires_comment: bool
    requires_assignee: bool


class RequestPermissions(BaseModel):
    editable_fields: list[str]
    can_assign: bool
    can_comment: bool


class RequestDetail(RequestSummary):
    description: str
    created_at: datetime
    updated_at: datetime
    allowed_transitions: list[AllowedTransitionRead]
    permissions: RequestPermissions


class RequestEventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    type: RequestEventType
    from_status: RequestStatus | None
    to_status: RequestStatus | None
    actor: UserRef | None
    comment: str | None
    details: dict[str, JsonValue]
    created_at: datetime


class BoardCard(RequestSummary):
    allowed_transitions: list[AllowedTransitionRead]


class BoardColumn(BaseModel):
    status: RequestStatus
    total: int
    items: list[BoardCard]


class RequestBoard(BaseModel):
    columns: list[BoardColumn]


class DueEstimate(BaseModel):
    priority: RequestPriority
    hours: int | None
