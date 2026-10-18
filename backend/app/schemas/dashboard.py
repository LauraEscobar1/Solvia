import uuid
from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import BottleneckReason, RequestPriority, RequestStatus, SlaStatus
from app.schemas.area import UserRef
from app.schemas.user import AreaRef


class DashboardQuery(BaseModel):
    area_id: uuid.UUID | None = None
    date_from: date | None = None
    date_to: date | None = None


class DateRangeRead(BaseModel):
    date_from: date
    date_to: date
    timezone: str


class StageCounts(BaseModel):
    received: int
    assigned: int
    in_progress: int


class DueDay(BaseModel):
    day: date
    count: int


class DashboardSummary(BaseModel):
    open: int
    due_soon: int
    overdue: int
    stalled: int
    completed_last_7_days: int
    completed_since: date
    avg_resolution_hours: float | None
    open_areas: int
    overdue_change: int
    high_risk: int
    due_soon_high_risk: int
    stalled_forgotten: int
    open_by_stage: StageCounts
    due_by_day: list[DueDay]
    baseline_requests: int
    range: DateRangeRead


class StatusCount(BaseModel):
    status: RequestStatus
    count: int


class StatusBreakdown(BaseModel):
    items: list[StatusCount]
    range: DateRangeRead


class DashboardRequestItem(BaseModel):
    id: uuid.UUID
    code: str
    title: str
    area: AreaRef
    assignee: UserRef | None
    priority: RequestPriority
    status: RequestStatus
    due_at: datetime | None
    last_activity_at: datetime
    sla_status: SlaStatus | None
    consumed_pct: int | None
    idle_hours: float
    inactivity_hours: int | None


class RequestHighlights(BaseModel):
    items: list[DashboardRequestItem]


class BottleneckCellRead(BaseModel):
    area: AreaRef
    status: RequestStatus
    count: int
    avg_hours: float | None
    median_count: float
    median_avg_hours: float | None
    sla_max_hours: float | None
    is_bottleneck: bool
    reasons: list[BottleneckReason]


class BottleneckMatrix(BaseModel):
    cells: list[BottleneckCellRead]


class TrendPoint(BaseModel):
    day: date
    created: int
    completed: int


class TrendSeries(BaseModel):
    days: list[TrendPoint]
    range: DateRangeRead


class StageFlowItem(BaseModel):
    status: RequestStatus
    count: int
    median_hours: float | None
    target_hours: float | None


class StageFlow(BaseModel):
    stages: list[StageFlowItem]


class AreaMetrics(BaseModel):
    area: AreaRef
    open: int
    overdue: int
    avg_resolution_hours: float | None


class AreaBreakdown(BaseModel):
    items: list[AreaMetrics]
    range: DateRangeRead
