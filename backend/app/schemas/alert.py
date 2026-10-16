import uuid
from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field, JsonValue

from app.models.enums import AlertSeverity, AlertSource, AlertType, RequestStatus
from app.schemas.common import SearchText
from app.schemas.user import AreaRef


class AlertState(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class AlertFilters(BaseModel):
    type: list[AlertType] = Field(default_factory=list)
    severity: list[AlertSeverity] = Field(default_factory=list)
    is_read: bool | None = None
    state: AlertState | None = None
    area_id: uuid.UUID | None = None
    q: SearchText | None = None


class AlertListQuery(AlertFilters):
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)


class AlertRequestRef(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    status: RequestStatus


class AlertRead(BaseModel):
    id: uuid.UUID
    type: AlertType
    severity: AlertSeverity
    source: AlertSource
    message_code: str
    params: dict[str, JsonValue]
    area: AreaRef
    request: AlertRequestRef | None
    is_read: bool
    created_at: datetime
    resolved_at: datetime | None


class AlertCount(BaseModel):
    count: int


class AlertEvaluationRead(BaseModel):
    created: int
    updated: int
    resolved: int
    bottlenecks: int
    skipped: bool
    duration_ms: int
