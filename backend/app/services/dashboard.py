import math
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ErrorCode, UnprocessableError
from app.core.time import Clock, day_end, day_start, local_date, utcnow
from app.models.enums import RequestStatus, UserRole
from app.models.user import User
from app.repositories.dashboard import DashboardFilter, DashboardRepository, Highlight, HighlightRow
from app.repositories.sla_rules import SlaRules
from app.schemas.area import UserRef
from app.schemas.dashboard import (
    AreaBreakdown,
    AreaMetrics,
    BottleneckCellRead,
    BottleneckMatrix,
    DashboardQuery,
    DashboardRequestItem,
    DashboardSummary,
    DateRangeRead,
    RequestHighlights,
    StageCounts,
    StatusBreakdown,
    StatusCount,
    TrendPoint,
    TrendSeries,
)
from app.schemas.user import AreaRef
from app.services.bottlenecks import BottleneckDetector
from app.services.request_policy import RequestPolicy

DEFAULT_RANGE_DAYS = 30
MAX_RANGE_DAYS = 366
RECENT_COMPLETION_DAYS = 7
HIGHLIGHT_LIMIT = 20
OVERDUE_CHANGE_WINDOW = timedelta(hours=24)


@dataclass(frozen=True, slots=True)
class _Period:
    date_from: date
    date_to: date
    start: datetime
    end: datetime
    today: date


def _round(value: float | None) -> float | None:
    return None if value is None else round(value, 1)


class DashboardService:
    def __init__(
        self,
        session: AsyncSession,
        timezone: ZoneInfo,
        *,
        bottleneck_min_count: int,
        clock: Clock = utcnow,
    ) -> None:
        self._session = session
        self._timezone = timezone
        self._bottleneck_min_count = bottleneck_min_count
        self._clock = clock
        self._repository = DashboardRepository(session)

    async def summary(self, actor: User, query: DashboardQuery) -> DashboardSummary:
        rules = SlaRules(self._clock())
        period = self._period(query, rules.now)
        completed_since = period.today - timedelta(days=RECENT_COMPLETION_DAYS - 1)
        target = self._filter(actor, query)
        yesterday = rules.now - OVERDUE_CHANGE_WINDOW
        overdue_before = await self._repository.overdue_at(target, yesterday)
        row = await self._repository.summary(
            target,
            rules,
            completed_since=day_start(completed_since, self._timezone),
            start=period.start,
            end=period.end,
        )
        return DashboardSummary(
            open=row.open,
            due_soon=row.due_soon,
            overdue=row.overdue,
            stalled=row.stalled,
            completed_last_7_days=row.completed_recently,
            completed_since=completed_since,
            avg_resolution_hours=_round(row.avg_resolution_hours),
            open_areas=row.open_areas,
            overdue_change=row.overdue - overdue_before,
            high_risk=row.high_risk,
            due_soon_high_risk=row.due_soon_high_risk,
            stalled_forgotten=row.stalled_forgotten,
            open_by_stage=StageCounts(
                received=row.open_by_stage[RequestStatus.RECEIVED],
                assigned=row.open_by_stage[RequestStatus.ASSIGNED],
                in_progress=row.open_by_stage[RequestStatus.IN_PROGRESS],
            ),
            range=self._range(period),
        )

    async def by_status(self, actor: User, query: DashboardQuery) -> StatusBreakdown:
        period = self._period(query, self._clock())
        counts = await self._repository.by_status(
            self._filter(actor, query), start=period.start, end=period.end
        )
        items = [StatusCount(status=item, count=counts.get(item, 0)) for item in RequestStatus]
        return StatusBreakdown(items=items, range=self._range(period))

    async def at_risk(self, actor: User, query: DashboardQuery) -> RequestHighlights:
        return await self._highlights(actor, query, Highlight.AT_RISK)

    async def stalled(self, actor: User, query: DashboardQuery) -> RequestHighlights:
        return await self._highlights(actor, query, Highlight.STALLED)

    async def bottlenecks(self, actor: User, query: DashboardQuery) -> BottleneckMatrix:
        area_ids = self._bottleneck_areas(actor, query.area_id)
        if area_ids is not None and not area_ids:
            return BottleneckMatrix(cells=[])
        detector = BottleneckDetector(
            self._session, min_count=self._bottleneck_min_count, clock=self._clock
        )
        cells = await detector.cells(self._timezone, area_ids)
        return BottleneckMatrix(
            cells=[
                BottleneckCellRead(
                    area=AreaRef(id=cell.area_id, name=cell.area_name),
                    status=cell.status,
                    count=cell.count,
                    avg_hours=_round(cell.avg_hours),
                    median_count=cell.median_count,
                    median_avg_hours=_round(cell.median_avg_hours),
                    sla_max_hours=_round(cell.sla_max_hours),
                    is_bottleneck=cell.is_bottleneck,
                    reasons=list(cell.reasons),
                )
                for cell in cells
            ]
        )

    async def trends(self, actor: User, query: DashboardQuery) -> TrendSeries:
        period = self._period(query, self._clock())
        target = self._filter(actor, query)
        timezone = self._timezone.key
        created = await self._repository.created_per_day(
            target, timezone, start=period.start, end=period.end
        )
        completed = await self._repository.completed_per_day(
            target, timezone, start=period.start, end=period.end
        )
        days = (period.date_to - period.date_from).days + 1
        return TrendSeries(
            days=[
                TrendPoint(day=day, created=created.get(day, 0), completed=completed.get(day, 0))
                for day in (period.date_from + timedelta(days=offset) for offset in range(days))
            ],
            range=self._range(period),
        )

    async def by_area(self, actor: User, query: DashboardQuery) -> AreaBreakdown:
        rules = SlaRules(self._clock())
        period = self._period(query, rules.now)
        rows = await self._repository.by_area(
            self._filter(actor, query), rules, start=period.start, end=period.end
        )
        return AreaBreakdown(
            items=[
                AreaMetrics(
                    area=AreaRef(id=row.area_id, name=row.area_name),
                    open=row.open,
                    overdue=row.overdue,
                    avg_resolution_hours=_round(row.avg_resolution_hours),
                )
                for row in rows
            ],
            range=self._range(period),
        )

    async def _highlights(
        self, actor: User, query: DashboardQuery, kind: Highlight
    ) -> RequestHighlights:
        rows = await self._repository.highlights(
            self._filter(actor, query), SlaRules(self._clock()), kind, limit=HIGHLIGHT_LIMIT
        )
        return RequestHighlights(items=[self._item(row) for row in rows])

    @staticmethod
    def _item(row: HighlightRow) -> DashboardRequestItem:
        request = row.request
        consumed = None if row.consumed_ratio is None else math.floor(row.consumed_ratio * 100)
        return DashboardRequestItem(
            id=request.id,
            code=request.code,
            title=request.title,
            area=AreaRef.model_validate(request.area),
            assignee=UserRef.model_validate(request.assignee) if request.assignee else None,
            priority=request.priority,
            status=request.status,
            due_at=request.due_at,
            last_activity_at=request.last_activity_at,
            sla_status=row.sla_status,
            consumed_pct=consumed,
            idle_hours=round(row.idle_hours, 1),
            inactivity_hours=row.inactivity_hours,
        )

    @staticmethod
    def _filter(actor: User, query: DashboardQuery) -> DashboardFilter:
        return DashboardFilter(scope=RequestPolicy(actor).scope(), area_id=query.area_id)

    @staticmethod
    def _bottleneck_areas(actor: User, area_id: uuid.UUID | None) -> list[uuid.UUID] | None:
        if actor.role is UserRole.ADMIN:
            return None if area_id is None else [area_id]
        if actor.role is UserRole.REQUESTER or actor.area_id is None:
            return []
        if area_id is not None and area_id != actor.area_id:
            return []
        return [actor.area_id]

    def _period(self, query: DashboardQuery, now: datetime) -> _Period:
        today = local_date(now, self._timezone)
        date_to = query.date_to or today
        date_from = query.date_from or date_to - timedelta(days=DEFAULT_RANGE_DAYS - 1)
        if date_from > date_to or (date_to - date_from).days >= MAX_RANGE_DAYS:
            raise UnprocessableError(
                ErrorCode.VALIDATION_ERROR,
                params={"fields": [{"loc": "query.date_from", "type": "date_range"}]},
            )
        return _Period(
            date_from=date_from,
            date_to=date_to,
            start=day_start(date_from, self._timezone),
            end=day_end(date_to, self._timezone),
            today=today,
        )

    def _range(self, period: _Period) -> DateRangeRead:
        return DateRangeRead(
            date_from=period.date_from, date_to=period.date_to, timezone=self._timezone.key
        )
