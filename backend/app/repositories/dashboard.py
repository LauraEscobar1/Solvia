import uuid
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import ColumnElement, Date, Select, and_, cast, func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.risk_model import HIGH_RISK_SCORE
from app.models.area import Area
from app.models.enums import SLA_STAGES, RequestStatus, SlaStatus
from app.models.request import ServiceRequest
from app.models.request_event import RequestEvent
from app.models.sla_policy import SlaPolicy
from app.repositories.request import RequestScope, scope_condition
from app.repositories.risk_rules import RiskRules
from app.repositories.sla_rules import Expression, SlaRules, elapsed_hours, stage_policy_hours
from app.repositories.stage_history import stage_entered_at, status_change


class Highlight(StrEnum):
    AT_RISK = "at_risk"
    STALLED = "stalled"


@dataclass(frozen=True, slots=True)
class DashboardFilter:
    scope: RequestScope
    area_id: uuid.UUID | None

    def conditions(self) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        visible = scope_condition(self.scope)
        if visible is not None:
            conditions.append(visible)
        if self.area_id is not None:
            conditions.append(ServiceRequest.area_id == self.area_id)
        return conditions


@dataclass(frozen=True, slots=True)
class SummaryRow:
    open: int
    due_soon: int
    overdue: int
    stalled: int
    completed_recently: int
    avg_resolution_hours: float | None
    open_areas: int
    high_risk: int
    due_soon_high_risk: int
    stalled_forgotten: int
    open_by_stage: dict[RequestStatus, int]


@dataclass(frozen=True, slots=True)
class HighlightRow:
    request: ServiceRequest
    sla_status: SlaStatus | None
    consumed_ratio: float | None
    idle_hours: float
    inactivity_hours: int | None


@dataclass(frozen=True, slots=True)
class AreaRow:
    area_id: uuid.UUID
    area_name: str
    open: int
    overdue: int
    avg_resolution_hours: float | None


@dataclass(frozen=True, slots=True)
class StageFlowRow:
    status: RequestStatus
    count: int
    median_hours: float | None
    target_hours: float | None


def _float(value: float | Decimal | None) -> float | None:
    return None if value is None else float(value)


def _resolution_hours() -> ColumnElement[float]:
    return elapsed_hours(ServiceRequest.received_at, ServiceRequest.completed_at)


def _open_or_completed_since(rules: SlaRules, since: datetime) -> ColumnElement[bool]:
    return or_(
        rules.is_open,
        and_(
            ServiceRequest.status == RequestStatus.COMPLETED,
            ServiceRequest.completed_at >= since,
        ),
    )


def _completed_between(start: datetime, end: datetime) -> ColumnElement[bool]:
    return and_(
        ServiceRequest.status == RequestStatus.COMPLETED,
        ServiceRequest.completed_at >= start,
        ServiceRequest.completed_at < end,
    )


class DashboardRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def summary(
        self,
        target: DashboardFilter,
        rules: SlaRules,
        *,
        completed_since: datetime,
        start: datetime,
        end: datetime,
    ) -> SummaryRow:
        high_risk = RiskRules(rules).score >= HIGH_RISK_SCORE
        row = (
            await self._session.execute(
                select(
                    func.count().filter(rules.is_open),
                    func.count().filter(rules.is_due_soon),
                    func.count().filter(rules.is_overdue),
                    func.count().filter(rules.is_stalled),
                    func.count().filter(_completed_between(completed_since, rules.now)),
                    func.avg(_resolution_hours()).filter(_completed_between(start, end)),
                    func.count(ServiceRequest.area_id.distinct()).filter(rules.is_open),
                    func.count().filter(and_(rules.is_open, high_risk)),
                    func.count().filter(and_(rules.is_due_soon, high_risk)),
                    func.count().filter(
                        and_(rules.is_stalled, or_(ServiceRequest.assignee_id.is_(None), high_risk))
                    ),
                    *(func.count().filter(ServiceRequest.status == stage) for stage in SLA_STAGES),
                ).where(
                    *target.conditions(),
                    _open_or_completed_since(rules, min(start, completed_since)),
                )
            )
        ).one()
        (
            open_count,
            due_soon,
            overdue,
            stalled,
            completed,
            avg_resolution,
            open_areas,
            high,
            due_soon_high,
            forgotten,
            *by_stage,
        ) = row
        return SummaryRow(
            open=open_count,
            due_soon=due_soon,
            overdue=overdue,
            stalled=stalled,
            completed_recently=completed,
            avg_resolution_hours=_float(avg_resolution),
            open_areas=open_areas,
            high_risk=high,
            due_soon_high_risk=due_soon_high,
            stalled_forgotten=forgotten,
            open_by_stage=dict(zip(SLA_STAGES, by_stage, strict=True)),
        )

    async def overdue_at(self, target: DashboardFilter, moment: datetime) -> int:
        status_then = (
            select(RequestEvent.to_status)
            .where(
                RequestEvent.request_id == ServiceRequest.id,
                status_change(),
                RequestEvent.created_at <= moment,
            )
            .order_by(RequestEvent.created_at.desc(), RequestEvent.id.desc())
            .limit(1)
            .correlate(ServiceRequest)
            .scalar_subquery()
        )
        total = await self._session.scalar(
            select(func.count())
            .select_from(ServiceRequest)
            .where(
                *target.conditions(),
                ServiceRequest.received_at <= moment,
                ServiceRequest.due_at < literal(moment),
                func.coalesce(status_then, ServiceRequest.status).in_(SLA_STAGES),
            )
        )
        return total or 0

    async def baseline_requests(self, target: DashboardFilter, since: datetime) -> int:
        total = await self._session.scalar(
            select(func.count())
            .select_from(ServiceRequest)
            .where(
                *target.conditions(),
                ServiceRequest.status == RequestStatus.COMPLETED,
                ServiceRequest.completed_at >= since,
            )
        )
        return total or 0

    async def due_per_day(
        self,
        target: DashboardFilter,
        rules: SlaRules,
        timezone: str,
        *,
        start: datetime,
        end: datetime,
    ) -> dict[date, int]:
        days = (
            select(cast(func.timezone(timezone, ServiceRequest.due_at), Date).label("day"))
            .where(
                *target.conditions(),
                rules.is_open,
                ServiceRequest.due_at >= start,
                ServiceRequest.due_at < end,
            )
            .subquery()
        )
        rows = await self._session.execute(select(days.c.day, func.count()).group_by(days.c.day))
        return dict(rows.all())

    async def by_status(
        self, target: DashboardFilter, *, start: datetime, end: datetime
    ) -> dict[RequestStatus, int]:
        rows = await self._session.execute(
            select(ServiceRequest.status, func.count())
            .where(
                *target.conditions(),
                ServiceRequest.received_at >= start,
                ServiceRequest.received_at < end,
            )
            .group_by(ServiceRequest.status)
        )
        return dict(rows.all())

    async def highlights(
        self, target: DashboardFilter, rules: SlaRules, kind: Highlight, *, limit: int
    ) -> list[HighlightRow]:
        statement = self._highlight_columns(rules).where(*target.conditions(), rules.is_open)
        if kind is Highlight.AT_RISK:
            statement = statement.where(or_(rules.is_overdue, rules.is_due_soon)).order_by(
                rules.is_overdue.desc(), rules.consumed_ratio.desc().nulls_last()
            )
        else:
            statement = statement.where(rules.is_stalled).order_by(rules.idle_hours.desc())
        rows = await self._session.execute(statement.order_by(ServiceRequest.id).limit(limit))
        return [
            HighlightRow(
                request=request,
                sla_status=SlaStatus(sla_status) if sla_status is not None else None,
                consumed_ratio=consumed_ratio,
                idle_hours=idle_hours,
                inactivity_hours=inactivity_hours,
            )
            for request, sla_status, consumed_ratio, idle_hours, inactivity_hours in rows
        ]

    async def created_per_day(
        self, target: DashboardFilter, timezone: str, *, start: datetime, end: datetime
    ) -> dict[date, int]:
        return await self._per_day(
            target,
            timezone,
            ServiceRequest.received_at,
            [ServiceRequest.received_at >= start, ServiceRequest.received_at < end],
        )

    async def completed_per_day(
        self, target: DashboardFilter, timezone: str, *, start: datetime, end: datetime
    ) -> dict[date, int]:
        return await self._per_day(
            target, timezone, ServiceRequest.completed_at, [_completed_between(start, end)]
        )

    async def by_area(
        self, target: DashboardFilter, rules: SlaRules, *, start: datetime, end: datetime
    ) -> list[AreaRow]:
        rows = await self._session.execute(
            select(
                ServiceRequest.area_id,
                Area.name,
                func.count().filter(rules.is_open),
                func.count().filter(rules.is_overdue),
                func.avg(_resolution_hours()).filter(_completed_between(start, end)),
            )
            .join(Area, Area.id == ServiceRequest.area_id)
            .where(*target.conditions(), _open_or_completed_since(rules, start))
            .group_by(ServiceRequest.area_id, Area.name)
            .order_by(func.lower(Area.name), ServiceRequest.area_id)
        )
        return [
            AreaRow(area_id, name, open_count, overdue, _float(avg_resolution))
            for area_id, name, open_count, overdue, avg_resolution in rows
        ]

    async def stage_flow(self, target: DashboardFilter, now: datetime) -> list[StageFlowRow]:
        rows = await self._session.execute(
            select(
                ServiceRequest.status,
                func.count(),
                func.percentile_cont(0.5).within_group(elapsed_hours(stage_entered_at(), now)),
                func.avg(
                    stage_policy_hours(
                        SlaPolicy.max_hours, ServiceRequest.priority, ServiceRequest.status
                    )
                ),
            )
            .where(*target.conditions(), ServiceRequest.status.in_(SLA_STAGES))
            .group_by(ServiceRequest.status)
        )
        found = {
            status: StageFlowRow(status, count, _float(median), _float(target_hours))
            for status, count, median, target_hours in rows
        }
        return [found.get(stage, StageFlowRow(stage, 0, None, None)) for stage in SLA_STAGES]

    async def _per_day(
        self,
        target: DashboardFilter,
        timezone: str,
        moment: Expression[datetime | None],
        bounds: list[ColumnElement[bool]],
    ) -> dict[date, int]:
        days = (
            select(cast(func.timezone(timezone, moment), Date).label("day"))
            .where(*target.conditions(), *bounds)
            .subquery()
        )
        rows = await self._session.execute(select(days.c.day, func.count()).group_by(days.c.day))
        return dict(rows.all())

    @staticmethod
    def _highlight_columns(
        rules: SlaRules,
    ) -> Select[ServiceRequest, str | None, float, float, int]:
        return select(
            ServiceRequest,
            rules.sla_status,
            rules.consumed_ratio,
            rules.idle_hours,
            rules.inactivity_threshold,
        ).options(selectinload(ServiceRequest.area), selectinload(ServiceRequest.assignee))
