import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from app.ai.analytics import RiskBreakdown
from app.ai.risk_model import RiskFactor
from app.models.enums import RequestPriority, RequestStatus
from app.services.bottlenecks import BottleneckCell

TOP_RISK_LIMIT = 10


@dataclass(frozen=True, slots=True)
class RequestContext:
    code: str
    area_name: str
    priority: RequestPriority
    status: RequestStatus
    received_at: datetime
    due_at: datetime | None
    last_activity_at: datetime
    has_assignee: bool
    status_changes: int
    returns: int
    reassignments: int
    comments: int


@dataclass(frozen=True, slots=True)
class StageContext:
    open_in_stage: int
    median_open_30d: float
    is_bottleneck: bool


@dataclass(frozen=True, slots=True)
class Totals:
    open: int
    due_soon: int
    overdue: int
    stalled: int
    completed_last_7_days: int
    avg_resolution_hours: float | None


@dataclass(frozen=True, slots=True)
class TrendWeek:
    week_start: date
    created: int
    completed: int


@dataclass(frozen=True, slots=True)
class OverviewContext:
    area_id: uuid.UUID | None
    day: date
    timezone: str
    areas: Sequence[tuple[uuid.UUID, str]]
    totals: Totals
    cells: Sequence[BottleneckCell]
    trend_weeks: Sequence[TrendWeek]
    top_risks: Sequence[RiskBreakdown]


def _hours(start: datetime, end: datetime) -> float:
    return round((end - start).total_seconds() / 3600, 1)


def _factors(risk: RiskBreakdown) -> list[dict[str, Any]]:
    factors: list[dict[str, Any]] = []
    for item in risk.factors:
        factor: dict[str, Any] = {"factor": item.factor.value, "value": item.value}
        if item.reference is not None:
            factor["reference"] = item.reference
        if item.reference_kind is not None:
            factor["reference_kind"] = item.reference_kind.value
        factor["points"] = item.points
        factors.append(factor)
    return factors


def request_payload(
    context: RequestContext,
    risk: RiskBreakdown,
    stage: StageContext | None,
    now: datetime,
) -> dict[str, Any]:
    request: dict[str, Any] = {
        "code": context.code,
        "area": context.area_name,
        "priority": context.priority.value,
        "status": context.status.value,
        "hours_open": _hours(context.received_at, now),
        "has_assignee": context.has_assignee,
    }
    if context.due_at is not None:
        request["sla_total_hours"] = _hours(context.received_at, context.due_at)
        consumed = risk.factor(RiskFactor.SLA_CONSUMED).value
        if isinstance(consumed, float):
            request["sla_consumed_pct"] = round(consumed * 100)
        if now >= context.due_at:
            request["hours_past_due"] = _hours(context.due_at, now)
        else:
            request["hours_to_due"] = _hours(now, context.due_at)
    payload: dict[str, Any] = {
        "request": request,
        "rules_risk": {"score": risk.score, "factors": _factors(risk)},
        "history": {
            "status_changes": context.status_changes,
            "returns_to_received": context.returns,
            "reassignments": context.reassignments,
            "comments": context.comments,
            "hours_since_last_activity": _hours(context.last_activity_at, now),
        },
    }
    if stage is not None:
        payload["area_stage"] = {
            "open_in_stage": stage.open_in_stage,
            "median_open_30d": stage.median_open_30d,
            "is_bottleneck": stage.is_bottleneck,
        }
    return payload


def request_text(title: str, description: str) -> str:
    return f"Title: {title}\nDescription: {description}"


def _cell(cell: BottleneckCell) -> dict[str, Any]:
    return {
        "area_id": str(cell.area_id),
        "status": cell.status.value,
        "open": cell.count,
        "avg_hours": None if cell.avg_hours is None else round(cell.avg_hours, 1),
        "median_open_30d": cell.median_count,
        "median_avg_hours_30d": (
            None if cell.median_avg_hours is None else round(cell.median_avg_hours, 1)
        ),
        "sla_max_hours": None if cell.sla_max_hours is None else round(cell.sla_max_hours, 1),
        "is_bottleneck": cell.is_bottleneck,
        "reasons": [reason.value for reason in cell.reasons],
    }


def _top_risk(risk: RiskBreakdown) -> dict[str, Any]:
    return {
        "code": risk.code,
        "area_id": str(risk.area_id),
        "status": risk.status.value,
        "priority": risk.priority.value,
        "risk_score": risk.score,
        "top_factors": [factor.value for factor in risk.top_factors()],
    }


def overview_payload(context: OverviewContext) -> dict[str, Any]:
    totals = context.totals
    return {
        "scope": "area" if context.area_id else "global",
        "date": context.day.isoformat(),
        "timezone": context.timezone,
        "areas": [{"id": str(area_id), "name": name} for area_id, name in context.areas],
        "totals": {
            "open": totals.open,
            "due_soon": totals.due_soon,
            "overdue": totals.overdue,
            "stalled": totals.stalled,
            "completed_last_7_days": totals.completed_last_7_days,
            "avg_resolution_hours": totals.avg_resolution_hours,
        },
        "stages": [_cell(cell) for cell in context.cells if cell.count or cell.is_bottleneck],
        "trend_weeks": [
            {
                "week_start": week.week_start.isoformat(),
                "created": week.created,
                "completed": week.completed,
            }
            for week in context.trend_weeks
        ],
        "top_risk_requests": [_top_risk(risk) for risk in context.top_risks[:TOP_RISK_LIMIT]],
    }
