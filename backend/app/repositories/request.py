import uuid
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import ColumnElement, Row, Select, func, not_, or_, select
from sqlalchemy.orm import aliased, selectinload

from app.core.time import day_end, day_start
from app.models.area import Area
from app.models.enums import CLOSED_STATUSES, RequestPriority, RequestStatus, SlaStatus, UserRole
from app.models.request import ServiceRequest
from app.models.user import User
from app.repositories.base import BaseRepository, contains_text
from app.repositories.risk_rules import RiskRules
from app.repositories.sla_rules import Expression, SlaRules
from app.schemas.request import RequestFilters

REQUEST_RELATIONS = (
    selectinload(ServiceRequest.area),
    selectinload(ServiceRequest.requester),
    selectinload(ServiceRequest.assignee),
)

_assignee = aliased(User)


@dataclass(frozen=True, slots=True)
class RequestScope:
    everything: bool
    user_id: uuid.UUID
    area_id: uuid.UUID | None
    include_assigned: bool


@dataclass(frozen=True, slots=True)
class RequestWithSla:
    request: ServiceRequest
    sla_status: SlaStatus | None
    is_stalled: bool
    risk_score: int | None


@dataclass(frozen=True, slots=True)
class RequestSlaState:
    id: uuid.UUID
    code: str
    area_id: uuid.UUID
    priority: RequestPriority
    status: RequestStatus
    due_at: datetime | None
    last_activity_at: datetime
    is_overdue: bool
    is_due_soon: bool
    is_stalled: bool
    inactivity_threshold: int | None


def _with_sla(row: Row[ServiceRequest, str | None, bool, int | None]) -> RequestWithSla:
    request, sla_status, is_stalled, risk_score = row
    return RequestWithSla(
        request=request,
        risk_score=risk_score,
        sla_status=SlaStatus(sla_status) if sla_status is not None else None,
        is_stalled=bool(is_stalled),
    )


def _flag(condition: ColumnElement[bool], *, wanted: bool | None) -> list[ColumnElement[bool]]:
    if wanted is None:
        return []
    return [condition if wanted else not_(condition)]


def _sla_conditions(filters: RequestFilters, rules: SlaRules) -> list[ColumnElement[bool]]:
    conditions = [
        *_flag(rules.is_overdue, wanted=filters.overdue),
        *_flag(rules.is_stalled, wanted=filters.stalled),
    ]
    if filters.sla_status is not None:
        conditions.append(rules.status_is(filters.sla_status))
    return conditions


def _day_range(
    column: Expression[datetime | None],
    first: date | None,
    last: date | None,
    timezone: ZoneInfo,
) -> list[ColumnElement[bool]]:
    conditions: list[ColumnElement[bool]] = []
    if first is not None:
        conditions.append(column >= day_start(first, timezone))
    if last is not None:
        conditions.append(column < day_end(last, timezone))
    return conditions


def scope_condition(scope: RequestScope) -> ColumnElement[bool] | None:
    if scope.everything:
        return None
    visible = [ServiceRequest.requester_id == scope.user_id]
    if scope.include_assigned:
        visible.append(ServiceRequest.assignee_id == scope.user_id)
    if scope.area_id is not None:
        visible.append(ServiceRequest.area_id == scope.area_id)
    return or_(*visible)


class RequestRepository(BaseRepository[ServiceRequest]):
    model = ServiceRequest

    async def get_with_relations(
        self, request_id: uuid.UUID, rules: SlaRules
    ) -> RequestWithSla | None:
        row = (
            await self._session.execute(
                self._with_indicators(rules)
                .where(ServiceRequest.id == request_id)
                .execution_options(populate_existing=True)
            )
        ).first()
        return None if row is None else _with_sla(row)

    async def assignee_loads(self, area_id: uuid.UUID) -> list[tuple[User, int]]:
        open_count = (
            select(func.count())
            .where(
                ServiceRequest.assignee_id == User.id,
                ServiceRequest.status.not_in(CLOSED_STATUSES),
            )
            .correlate(User)
            .scalar_subquery()
        )
        rows = await self._session.execute(
            select(User, open_count)
            .where(User.role == UserRole.ASSIGNEE, User.is_active, User.area_id == area_id)
            .order_by(User.full_name, User.id)
        )
        return [(user, count) for user, count in rows]

    async def open_count_for(self, user_id: uuid.UUID) -> int:
        total = await self._session.scalar(
            select(func.count()).where(
                ServiceRequest.assignee_id == user_id,
                ServiceRequest.status.not_in(CLOSED_STATUSES),
            )
        )
        return total or 0

    async def get_for_update(self, request_id: uuid.UUID) -> ServiceRequest | None:
        return await self._session.scalar(
            select(ServiceRequest)
            .where(ServiceRequest.id == request_id)
            .with_for_update(of=ServiceRequest)
            .execution_options(populate_existing=True)
        )

    async def search(
        self,
        scope: RequestScope,
        filters: RequestFilters,
        *,
        sort: str,
        page: int,
        size: int,
        rules: SlaRules,
        timezone: ZoneInfo,
    ) -> tuple[list[RequestWithSla], int]:
        conditions = self.conditions(scope, filters, rules, timezone)
        total = await self._session.scalar(
            select(func.count()).select_from(ServiceRequest).where(*conditions)
        )
        statement = self._sorted(self._with_indicators(rules).where(*conditions), sort, rules)
        rows = await self._session.execute(statement.limit(size).offset((page - 1) * size))
        return [_with_sla(row) for row in rows], total or 0

    async def board_column(
        self,
        scope: RequestScope,
        filters: RequestFilters,
        status: RequestStatus,
        *,
        limit: int,
        rules: SlaRules,
        timezone: ZoneInfo,
    ) -> list[RequestWithSla]:
        rows = await self._session.execute(
            self._with_indicators(rules)
            .where(
                *self.conditions(scope, filters, rules, timezone), ServiceRequest.status == status
            )
            .order_by(
                ServiceRequest.priority.desc(),
                ServiceRequest.due_at.asc().nulls_last(),
                ServiceRequest.id,
            )
            .limit(limit)
        )
        return [_with_sla(row) for row in rows]

    async def count_by_status(
        self, scope: RequestScope, filters: RequestFilters, rules: SlaRules, timezone: ZoneInfo
    ) -> dict[RequestStatus, int]:
        rows = await self._session.execute(
            select(ServiceRequest.status, func.count())
            .where(*self.conditions(scope, filters, rules, timezone))
            .group_by(ServiceRequest.status)
        )
        return dict(rows.all())

    async def sla_states(
        self, rules: SlaRules, *, request_id: uuid.UUID | None = None
    ) -> list[RequestSlaState]:
        statement = (
            select(
                ServiceRequest.id,
                ServiceRequest.code,
                ServiceRequest.area_id,
                ServiceRequest.priority,
                ServiceRequest.status,
                ServiceRequest.due_at,
                ServiceRequest.last_activity_at,
                rules.is_overdue.label("is_overdue"),
                rules.is_due_soon.label("is_due_soon"),
                rules.is_stalled.label("is_stalled"),
                rules.inactivity_threshold.label("inactivity_threshold"),
            )
            .where(rules.is_open)
            .order_by(ServiceRequest.id)
            .with_for_update(read=True, of=ServiceRequest)
        )
        if request_id is not None:
            statement = statement.where(ServiceRequest.id == request_id)
        rows = await self._session.execute(statement)
        return [RequestSlaState(**row._asdict()) for row in rows]

    @staticmethod
    def _with_indicators(rules: SlaRules) -> Select[ServiceRequest, str | None, bool, int | None]:
        return select(
            ServiceRequest,
            rules.sla_status.label("sla_status"),
            rules.is_stalled,
            RiskRules(rules).score.label("risk_score"),
        ).options(*REQUEST_RELATIONS)

    @staticmethod
    def conditions(
        scope: RequestScope, filters: RequestFilters, rules: SlaRules, timezone: ZoneInfo
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        visible = scope_condition(scope)
        if visible is not None:
            conditions.append(visible)

        if filters.status:
            conditions.append(ServiceRequest.status.in_(filters.status))
        if filters.priority:
            conditions.append(ServiceRequest.priority.in_(filters.priority))
        if filters.area_id is not None:
            conditions.append(ServiceRequest.area_id == filters.area_id)
        if filters.assignee_id is not None:
            conditions.append(ServiceRequest.assignee_id == filters.assignee_id)
        if filters.requester_id is not None:
            conditions.append(ServiceRequest.requester_id == filters.requester_id)
        if filters.q:
            conditions.append(contains_text([ServiceRequest.code, ServiceRequest.title], filters.q))
        return [
            *conditions,
            *_sla_conditions(filters, rules),
            *_day_range(
                ServiceRequest.received_at, filters.received_from, filters.received_to, timezone
            ),
            *_day_range(
                ServiceRequest.completed_at, filters.completed_from, filters.completed_to, timezone
            ),
        ]

    @staticmethod
    def _sorted[*Ts](statement: Select[*Ts], sort: str, rules: SlaRules) -> Select[*Ts]:
        descending = sort.startswith("-")
        field = sort.lstrip("-")
        if field == "risk_score":
            column: ColumnElement[Any] = RiskRules(rules).score
        elif field == "area":
            statement = statement.join(Area, Area.id == ServiceRequest.area_id)
            column = func.lower(Area.name)
        elif field == "assignee":
            statement = statement.outerjoin(_assignee, _assignee.id == ServiceRequest.assignee_id)
            column = func.lower(_assignee.full_name)
        else:
            column = getattr(ServiceRequest, field)
        ordered = column.desc() if descending else column.asc()
        return statement.order_by(ordered.nulls_last(), ServiceRequest.id)
