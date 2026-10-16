import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    ColumnElement,
    DateTime,
    and_,
    func,
    literal,
    or_,
    select,
    true,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.area import Area
from app.models.enums import SLA_STAGES, RequestStatus
from app.models.request import ServiceRequest
from app.models.request_event import RequestEvent
from app.models.sla_policy import SlaPolicy
from app.repositories.sla_rules import elapsed_hours, stage_policy_hours


@dataclass(frozen=True, slots=True)
class StageLoad:
    area_id: uuid.UUID
    status: RequestStatus
    count: int
    avg_hours: float
    sla_max_hours: float | None


@dataclass(frozen=True, slots=True)
class StageHistory:
    area_id: uuid.UUID
    status: RequestStatus
    median_count: float
    median_avg_hours: float | None


@dataclass(frozen=True, slots=True)
class AreaRow:
    id: uuid.UUID
    name: str
    is_active: bool


def _status_change() -> ColumnElement[bool]:
    return and_(
        RequestEvent.to_status.is_not(None),
        RequestEvent.from_status.is_distinct_from(RequestEvent.to_status),
    )


def stage_entered_at() -> ColumnElement[datetime]:
    entered = (
        select(func.max(RequestEvent.created_at))
        .where(
            RequestEvent.request_id == ServiceRequest.id,
            RequestEvent.to_status == ServiceRequest.status,
            _status_change(),
        )
        .scalar_subquery()
    )
    return func.coalesce(entered, ServiceRequest.received_at)


def _in_areas(area_ids: Sequence[uuid.UUID] | None) -> list[ColumnElement[bool]]:
    return [] if area_ids is None else [ServiceRequest.area_id.in_(area_ids)]


def _float(value: float | Decimal | None) -> float | None:
    return None if value is None else float(value)


class BottleneckRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def current_load(
        self, now: datetime, area_ids: Sequence[uuid.UUID] | None
    ) -> list[StageLoad]:
        rows = await self._session.execute(
            select(
                ServiceRequest.area_id,
                ServiceRequest.status,
                func.count(),
                func.avg(elapsed_hours(stage_entered_at(), now)),
                func.avg(
                    stage_policy_hours(
                        SlaPolicy.max_hours, ServiceRequest.priority, ServiceRequest.status
                    )
                ),
            )
            .where(ServiceRequest.status.in_(SLA_STAGES), *_in_areas(area_ids))
            .group_by(ServiceRequest.area_id, ServiceRequest.status)
        )
        return [
            StageLoad(area_id, status, count, float(avg_hours), _float(sla_max))
            for area_id, status, count, avg_hours, sla_max in rows
        ]

    async def history(
        self, snapshots: Sequence[datetime], area_ids: Sequence[uuid.UUID] | None
    ) -> list[StageHistory]:
        first, last = min(snapshots), max(snapshots)
        changes = (
            select(
                ServiceRequest.area_id,
                RequestEvent.to_status.label("status"),
                RequestEvent.created_at.label("entered_at"),
                func.lead(RequestEvent.created_at)
                .over(
                    partition_by=RequestEvent.request_id,
                    order_by=(RequestEvent.created_at, RequestEvent.id),
                )
                .label("left_at"),
            )
            .join(ServiceRequest, ServiceRequest.id == RequestEvent.request_id)
            .where(
                _status_change(),
                ServiceRequest.received_at <= last,
                or_(
                    ServiceRequest.status.in_(SLA_STAGES),
                    ServiceRequest.last_activity_at >= first,
                ),
                *_in_areas(area_ids),
            )
            .cte("stage_changes")
        )
        taken = select(
            func.unnest(literal(list(snapshots), ARRAY(DateTime(timezone=True)))).label("taken_at")
        ).cte("snapshots")
        samples = (
            select(
                taken.c.taken_at,
                changes.c.area_id,
                changes.c.status,
                func.count().label("count"),
                func.avg(elapsed_hours(changes.c.entered_at, taken.c.taken_at)).label("avg_hours"),
            )
            .select_from(taken)
            .join(
                changes,
                and_(
                    changes.c.entered_at <= taken.c.taken_at,
                    or_(changes.c.left_at.is_(None), changes.c.left_at > taken.c.taken_at),
                ),
            )
            .where(changes.c.status.in_(SLA_STAGES))
            .group_by(taken.c.taken_at, changes.c.area_id, changes.c.status)
            .cte("samples")
        )
        cells = select(samples.c.area_id, samples.c.status).distinct().cte("cells")
        rows = await self._session.execute(
            select(
                cells.c.area_id,
                cells.c.status,
                func.percentile_cont(0.5).within_group(func.coalesce(samples.c.count, 0)),
                func.percentile_cont(0.5).within_group(samples.c.avg_hours),
            )
            .select_from(taken)
            .join(cells, true())
            .outerjoin(
                samples,
                and_(
                    samples.c.taken_at == taken.c.taken_at,
                    samples.c.area_id == cells.c.area_id,
                    samples.c.status == cells.c.status,
                ),
            )
            .group_by(cells.c.area_id, cells.c.status)
        )
        return [
            StageHistory(area_id, status, float(median_count), _float(median_hours))
            for area_id, status, median_count, median_hours in rows
        ]

    async def areas(self, area_ids: Sequence[uuid.UUID] | None) -> list[AreaRow]:
        statement = select(Area.id, Area.name, Area.is_active).order_by(
            func.lower(Area.name), Area.id
        )
        if area_ids is not None:
            statement = statement.where(Area.id.in_(area_ids))
        rows = await self._session.execute(statement)
        return [AreaRow(*row) for row in rows]
