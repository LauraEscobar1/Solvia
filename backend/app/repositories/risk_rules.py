from sqlalchemy import ColumnElement, Float, Integer, case, cast, func, literal, null, select
from sqlalchemy.orm import aliased

from app.ai.risk_model import (
    ASSIGNEE_LOAD_REFERENCE,
    INACTIVITY_CAP,
    PRIORITY_VALUES,
    RISK_WEIGHTS,
    SLA_CONSUMED_CAP,
    STAGE_DELAY_CAP,
    UNASSIGNED_DELAYED,
    UNASSIGNED_WITHIN_NORMAL,
    ReferenceKind,
    RiskFactor,
)
from app.models.enums import SLA_STAGES
from app.models.request import ServiceRequest
from app.models.risk_baseline import RiskBaseline
from app.models.sla_policy import SlaPolicy
from app.repositories.sla_rules import SlaRules, elapsed_hours, stage_policy_hours
from app.repositories.stage_history import stage_entered_at

_other = aliased(ServiceRequest)


def _number(value: float) -> ColumnElement[float]:
    return literal(value, Float())


def _capped(ratio: ColumnElement[float], cap: float) -> ColumnElement[float]:
    bounded = func.least(func.greatest(func.coalesce(ratio, 0.0), 0.0), _number(cap))
    return cast(bounded / cap, Float())


class RiskRules:
    def __init__(self, sla: SlaRules) -> None:
        self.sla = sla

    @property
    def hours_in_stage(self) -> ColumnElement[float]:
        return elapsed_hours(stage_entered_at(), self.sla.now)

    def _baseline(self, *, by_area: bool) -> ColumnElement[float]:
        area = (
            RiskBaseline.area_id == ServiceRequest.area_id
            if by_area
            else RiskBaseline.area_id.is_(None)
        )
        return (
            select(RiskBaseline.p90_hours)
            .where(
                area,
                RiskBaseline.status == ServiceRequest.status,
                RiskBaseline.priority == ServiceRequest.priority,
            )
            .scalar_subquery()
        )

    @property
    def _sla_max_hours(self) -> ColumnElement[float]:
        return cast(
            stage_policy_hours(SlaPolicy.max_hours, ServiceRequest.priority, ServiceRequest.status),
            Float(),
        )

    @property
    def reference_hours(self) -> ColumnElement[float]:
        return func.coalesce(
            self._baseline(by_area=True), self._baseline(by_area=False), self._sla_max_hours
        )

    @property
    def reference_kind(self) -> ColumnElement[str | None]:
        return case(
            (self._baseline(by_area=True).is_not(None), ReferenceKind.P90_AREA.value),
            (self._baseline(by_area=False).is_not(None), ReferenceKind.P90_STAGE.value),
            (self._sla_max_hours.is_not(None), ReferenceKind.SLA_MAX.value),
            else_=null(),
        )

    @property
    def open_assigned(self) -> ColumnElement[int]:
        return (
            select(func.count())
            .select_from(_other)
            .where(
                _other.assignee_id == ServiceRequest.assignee_id,
                _other.status.in_(SLA_STAGES),
            )
            .scalar_subquery()
        )

    @property
    def stage_delay(self) -> ColumnElement[float]:
        ratio = self.hours_in_stage / func.nullif(self.reference_hours, 0.0)
        return _capped(ratio, STAGE_DELAY_CAP)

    @property
    def sla_consumed(self) -> ColumnElement[float]:
        return _capped(self.sla.consumed_ratio, SLA_CONSUMED_CAP)

    @property
    def inactivity(self) -> ColumnElement[float]:
        threshold = cast(self.sla.inactivity_threshold, Float())
        return _capped(self.sla.idle_hours / func.nullif(threshold, 0.0), INACTIVITY_CAP)

    @property
    def priority(self) -> ColumnElement[float]:
        return case(
            *((ServiceRequest.priority == key, value) for key, value in PRIORITY_VALUES.items()),
            else_=0.0,
        )

    @property
    def assignee_load(self) -> ColumnElement[float]:
        delayed = func.coalesce(self.hours_in_stage > self.reference_hours, False)
        unassigned = case((delayed, UNASSIGNED_DELAYED), else_=UNASSIGNED_WITHIN_NORMAL)
        loaded = func.least(
            cast(self.open_assigned, Float()) / ASSIGNEE_LOAD_REFERENCE, _number(1.0)
        )
        return case((ServiceRequest.assignee_id.is_(None), unassigned), else_=loaded)

    def factor(self, factor: RiskFactor) -> ColumnElement[float]:
        match factor:
            case RiskFactor.STAGE_DELAY:
                return self.stage_delay
            case RiskFactor.SLA_CONSUMED:
                return self.sla_consumed
            case RiskFactor.INACTIVITY:
                return self.inactivity
            case RiskFactor.PRIORITY:
                return self.priority
            case RiskFactor.ASSIGNEE_LOAD:
                return self.assignee_load

    @property
    def score(self) -> ColumnElement[int | None]:
        weighted = sum(
            (self.factor(factor) * weight for factor, weight in RISK_WEIGHTS.items()),
            start=_number(0.0),
        )
        return case(
            (~self.sla.is_open, null()),
            else_=cast(func.round(weighted * 100), Integer()),
        )
