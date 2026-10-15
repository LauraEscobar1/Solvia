import uuid
from dataclasses import dataclass
from datetime import UTC, date, datetime, time, timedelta

from sqlalchemy import ColumnElement, Select, func, not_, or_, select
from sqlalchemy.orm import aliased, selectinload

from app.models.area import Area
from app.models.enums import CLOSED_STATUSES, RequestStatus
from app.models.request import ServiceRequest
from app.models.user import User
from app.repositories.base import BaseRepository, contains_text
from app.schemas.request import RequestFilters

REQUEST_RELATIONS = (
    selectinload(ServiceRequest.area),
    selectinload(ServiceRequest.requester),
    selectinload(ServiceRequest.assignee),
)

_assignee = aliased(User)


def _day_start(day: date) -> datetime:
    return datetime.combine(day, time.min, tzinfo=UTC)


@dataclass(frozen=True, slots=True)
class RequestScope:
    everything: bool
    user_id: uuid.UUID
    area_id: uuid.UUID | None
    include_assigned: bool


class RequestRepository(BaseRepository[ServiceRequest]):
    model = ServiceRequest

    async def get_with_relations(self, request_id: uuid.UUID) -> ServiceRequest | None:
        return await self._session.scalar(
            select(ServiceRequest)
            .options(*REQUEST_RELATIONS)
            .where(ServiceRequest.id == request_id)
            .execution_options(populate_existing=True)
        )

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
        now: datetime,
    ) -> tuple[list[ServiceRequest], int]:
        statement = self._sorted(
            select(ServiceRequest)
            .options(*REQUEST_RELATIONS)
            .where(*self.conditions(scope, filters, now)),
            sort,
        )
        return await self.paginate(statement, page=page, size=size)

    async def board_column(
        self,
        scope: RequestScope,
        filters: RequestFilters,
        status: RequestStatus,
        *,
        limit: int,
        now: datetime,
    ) -> list[ServiceRequest]:
        rows = await self._session.scalars(
            select(ServiceRequest)
            .options(*REQUEST_RELATIONS)
            .where(*self.conditions(scope, filters, now), ServiceRequest.status == status)
            .order_by(
                ServiceRequest.priority.desc(),
                ServiceRequest.due_at.asc().nulls_last(),
                ServiceRequest.id,
            )
            .limit(limit)
        )
        return list(rows)

    async def count_by_status(
        self, scope: RequestScope, filters: RequestFilters, now: datetime
    ) -> dict[RequestStatus, int]:
        rows = await self._session.execute(
            select(ServiceRequest.status, func.count())
            .where(*self.conditions(scope, filters, now))
            .group_by(ServiceRequest.status)
        )
        return dict(rows.tuples().all())

    @staticmethod
    def conditions(
        scope: RequestScope, filters: RequestFilters, now: datetime
    ) -> list[ColumnElement[bool]]:
        conditions: list[ColumnElement[bool]] = []
        if not scope.everything:
            visible = [ServiceRequest.requester_id == scope.user_id]
            if scope.include_assigned:
                visible.append(ServiceRequest.assignee_id == scope.user_id)
            if scope.area_id is not None:
                visible.append(ServiceRequest.area_id == scope.area_id)
            conditions.append(or_(*visible))

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
        if filters.overdue is not None:
            overdue = ServiceRequest.due_at.is_not(None) & (ServiceRequest.due_at < now)
            overdue &= ServiceRequest.status.not_in(CLOSED_STATUSES)
            conditions.append(overdue if filters.overdue else not_(overdue))
        if filters.received_from is not None:
            conditions.append(ServiceRequest.received_at >= _day_start(filters.received_from))
        if filters.received_to is not None:
            end = _day_start(filters.received_to) + timedelta(days=1)
            conditions.append(ServiceRequest.received_at < end)
        return conditions

    @staticmethod
    def _sorted(statement: Select[ServiceRequest], sort: str) -> Select[ServiceRequest]:
        descending = sort.startswith("-")
        field = sort.lstrip("-")
        if field == "area":
            statement = statement.join(Area, Area.id == ServiceRequest.area_id)
            column: ColumnElement[object] = func.lower(Area.name)
        elif field == "assignee":
            statement = statement.outerjoin(_assignee, _assignee.id == ServiceRequest.assignee_id)
            column = func.lower(_assignee.full_name)
        else:
            column = getattr(ServiceRequest, field)
        ordered = column.desc() if descending else column.asc()
        return statement.order_by(ordered.nulls_last(), ServiceRequest.id)
