from datetime import datetime
from typing import Any

from sqlalchemy import (
    ColumnElement,
    DateTime,
    Float,
    and_,
    case,
    cast,
    extract,
    false,
    func,
    literal,
    null,
    select,
)
from sqlalchemy.orm import QueryableAttribute

from app.models.enums import SLA_STAGES, SlaStatus
from app.models.request import ServiceRequest
from app.models.sla_policy import SlaPolicy

DUE_SOON_RATIO = 0.75

type Expression[T] = ColumnElement[T] | QueryableAttribute[T]
type Instant = datetime | Expression[Any]


def _instant(value: Instant) -> Expression[Any]:
    if isinstance(value, datetime):
        return literal(value, DateTime(timezone=True))
    return value


def elapsed_hours(start: Instant, end: Instant) -> ColumnElement[float]:
    seconds = cast(extract("epoch", _instant(end) - _instant(start)), Float())
    return seconds / 3600


def stage_policy_hours(
    column: Expression[int],
    priority: Expression[Any],
    status: Expression[Any],
) -> ColumnElement[int]:
    return (
        select(column)
        .where(SlaPolicy.priority == priority, SlaPolicy.status == status)
        .scalar_subquery()
    )


def _definitely(condition: ColumnElement[bool]) -> ColumnElement[bool]:
    return func.coalesce(condition, false())


class SlaRules:
    def __init__(self, now: datetime) -> None:
        self.now = now
        self._now = _instant(now)

    @property
    def is_open(self) -> ColumnElement[bool]:
        return ServiceRequest.status.in_(SLA_STAGES)

    @property
    def consumed_ratio(self) -> ColumnElement[float]:
        window = elapsed_hours(ServiceRequest.received_at, ServiceRequest.due_at)
        return elapsed_hours(ServiceRequest.received_at, self._now) / func.nullif(window, 0)

    @property
    def is_overdue(self) -> ColumnElement[bool]:
        return and_(
            self.is_open,
            ServiceRequest.due_at.is_not(None),
            self._now >= ServiceRequest.due_at,
        )

    @property
    def is_due_soon(self) -> ColumnElement[bool]:
        return and_(
            self.is_open,
            ServiceRequest.due_at.is_not(None),
            self._now < ServiceRequest.due_at,
            _definitely(self.consumed_ratio >= DUE_SOON_RATIO),
        )

    @property
    def sla_status(self) -> ColumnElement[str | None]:
        return case(
            (~self.is_open, null()),
            (self.is_overdue, SlaStatus.OVERDUE.value),
            (self.is_due_soon, SlaStatus.AT_RISK.value),
            else_=SlaStatus.ON_TRACK.value,
        )

    @property
    def idle_hours(self) -> ColumnElement[float]:
        return elapsed_hours(ServiceRequest.last_activity_at, self._now)

    @property
    def inactivity_threshold(self) -> ColumnElement[int]:
        return stage_policy_hours(
            SlaPolicy.inactivity_hours, ServiceRequest.priority, ServiceRequest.status
        )

    @property
    def is_stalled(self) -> ColumnElement[bool]:
        return and_(self.is_open, _definitely(self.idle_hours > self.inactivity_threshold))

    def status_is(self, status: SlaStatus) -> ColumnElement[bool]:
        if status is SlaStatus.OVERDUE:
            return self.is_overdue
        if status is SlaStatus.AT_RISK:
            return self.is_due_soon
        return and_(self.is_open, ~self.is_overdue, ~self.is_due_soon)
