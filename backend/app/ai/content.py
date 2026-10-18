import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from pydantic import JsonValue

from app.ai.analytics import UNASSIGNED, RiskBreakdown
from app.ai.base import (
    MAX_ACTIONS,
    MAX_CAUSES,
    MAX_FINDINGS,
    MAX_RECOMMENDATIONS,
    FindingType,
    OverviewAnalysis,
    RecommendationPriority,
    RequestAnalysis,
    Target,
)
from app.ai.payloads import OverviewContext
from app.ai.risk_model import AUTOMATIC_ANALYSIS_THRESHOLD, RiskFactor
from app.models.enums import SLA_STAGES
from app.schemas.ai import (
    ActionRead,
    FindingRead,
    Message,
    OverviewInsightContent,
    RecommendationRead,
    RequestInsightContent,
    TargetRead,
)

MIN_CAUSE_POINTS = 5.0
DELAYED_STAGE = 1 / 1.5
LATE_INACTIVITY = 0.5
HEAVY_LOAD = 0.7
OVERDUE_RATIO = 1.0
DUE_SOON_RATIO = 0.75
RULE_BOTTLENECK_RECOMMENDATIONS = 3
RULE_REQUEST_RECOMMENDATIONS = 2


@dataclass(frozen=True, slots=True)
class OverviewScope:
    request_ids: Mapping[str, uuid.UUID]
    area_ids: frozenset[uuid.UUID]

    def area(self, value: str | None) -> uuid.UUID | None:
        if value is None:
            return None
        try:
            area_id = uuid.UUID(value)
        except ValueError:
            return None
        return area_id if area_id in self.area_ids else None


def _text(value: str) -> Message:
    return Message(text=value)


def _code(key: str, /, **params: JsonValue) -> Message:
    return Message(code=key, params=params)


def request_content_from_ai(analysis: RequestAnalysis) -> RequestInsightContent:
    return RequestInsightContent(
        risk_score=analysis.risk_score,
        summary=_text(analysis.summary),
        causes=[_text(cause) for cause in analysis.causes[:MAX_CAUSES]],
        actions=[
            ActionRead(title=_text(action.title), detail=_text(action.detail))
            for action in analysis.actions[:MAX_ACTIONS]
        ],
    )


def _cause(risk: RiskBreakdown, factor: RiskFactor) -> Message:
    item = risk.factor(factor)
    key = f"ai.rules.cause.{factor.value}"
    if factor is RiskFactor.PRIORITY:
        return _code(key, priority=risk.priority.value)
    if factor is RiskFactor.SLA_CONSUMED:
        percent = round(item.value * 100) if isinstance(item.value, float) else None
        return _code(key, percent=percent)
    if factor is RiskFactor.ASSIGNEE_LOAD and item.value == UNASSIGNED:
        return _code("ai.rules.cause.unassigned", status=risk.status.value)
    return _code(key, value=item.value, reference=item.reference)


def _rule_actions(risk: RiskBreakdown) -> list[ActionRead]:
    def normalized(factor: RiskFactor) -> float:
        return risk.factor(factor).normalized

    consumed = risk.factor(RiskFactor.SLA_CONSUMED).value
    candidates: list[tuple[float, str]] = []
    if risk.factor(RiskFactor.ASSIGNEE_LOAD).value == UNASSIGNED:
        candidates.append((risk.factor(RiskFactor.ASSIGNEE_LOAD).points, "assign"))
    elif normalized(RiskFactor.ASSIGNEE_LOAD) >= HEAVY_LOAD:
        candidates.append((risk.factor(RiskFactor.ASSIGNEE_LOAD).points, "rebalance"))
    if normalized(RiskFactor.STAGE_DELAY) >= DELAYED_STAGE:
        candidates.append((risk.factor(RiskFactor.STAGE_DELAY).points, "unblock_stage"))
    if isinstance(consumed, float) and consumed >= OVERDUE_RATIO:
        candidates.append((risk.factor(RiskFactor.SLA_CONSUMED).points, "renegotiate_due"))
    elif isinstance(consumed, float) and consumed >= DUE_SOON_RATIO:
        candidates.append((risk.factor(RiskFactor.SLA_CONSUMED).points, "prioritize"))
    if normalized(RiskFactor.INACTIVITY) >= LATE_INACTIVITY:
        candidates.append((risk.factor(RiskFactor.INACTIVITY).points, "follow_up"))
    ranked = sorted(candidates, key=lambda item: item[0], reverse=True)[:MAX_ACTIONS]
    return [
        ActionRead(
            title=_code(f"ai.rules.action.{name}.title"),
            detail=_code(
                f"ai.rules.action.{name}.detail", code=risk.code, status=risk.status.value
            ),
        )
        for _points, name in ranked
    ]


def request_content_from_rules(risk: RiskBreakdown) -> RequestInsightContent:
    top = [
        factor
        for factor in risk.top_factors(MAX_CAUSES)
        if risk.factor(factor).points >= MIN_CAUSE_POINTS
    ]
    return RequestInsightContent(
        risk_score=risk.score,
        summary=_code(
            "ai.rules.request.summary",
            code=risk.code,
            score=risk.score,
            factor=top[0].value if top else None,
        ),
        causes=[_cause(risk, factor) for factor in top],
        actions=_rule_actions(risk),
    )


def _target(target: Target | None, scope: OverviewScope) -> tuple[bool, TargetRead | None]:
    if target is None or (target.request_code is None and target.area_id is None):
        return True, None
    if target.request_code is not None:
        request_id = scope.request_ids.get(target.request_code.strip().upper())
        if request_id is None:
            return False, None
        return True, TargetRead(request_id=request_id, request_code=target.request_code.upper())
    area_id = scope.area(target.area_id)
    if area_id is None or (target.status is not None and target.status not in SLA_STAGES):
        return False, None
    return True, TargetRead(area_id=area_id, status=target.status)


def overview_content_from_ai(
    analysis: OverviewAnalysis, scope: OverviewScope
) -> OverviewInsightContent:
    findings: list[FindingRead] = []
    for finding in analysis.findings:
        area_id = scope.area(finding.area_id)
        if finding.area_id is not None and area_id is None:
            continue
        if finding.status is not None and finding.status not in SLA_STAGES:
            continue
        findings.append(
            FindingRead(
                type=finding.type,
                area_id=area_id,
                status=finding.status,
                evidence=_text(finding.evidence),
            )
        )
    recommendations: list[RecommendationRead] = []
    for recommendation in analysis.recommendations:
        valid, target = _target(recommendation.target, scope)
        if not valid:
            continue
        recommendations.append(
            RecommendationRead(
                title=_text(recommendation.title),
                detail=_text(recommendation.detail),
                priority=recommendation.priority,
                target=target,
            )
        )
    return OverviewInsightContent(
        headline=_text(analysis.headline) if analysis.headline else None,
        summary=_text(analysis.summary),
        findings=findings[:MAX_FINDINGS],
        recommendations=recommendations[:MAX_RECOMMENDATIONS],
    )


def _bottleneck_priority(reasons: int) -> RecommendationPriority:
    return RecommendationPriority.HIGH if reasons > 1 else RecommendationPriority.MEDIUM


def _area_name(names: Mapping[uuid.UUID, str], area_id: uuid.UUID) -> str:
    return names.get(area_id, "")


def overview_content_from_rules(context: OverviewContext) -> OverviewInsightContent:
    names = dict(context.areas)
    totals = context.totals
    flagged = sorted(
        (cell for cell in context.cells if cell.is_bottleneck),
        key=lambda cell: (len(cell.reasons), cell.count),
        reverse=True,
    )
    findings: list[FindingRead] = [
        FindingRead(
            type=FindingType.BOTTLENECK,
            area_id=cell.area_id,
            status=cell.status,
            evidence=_code(
                "ai.rules.finding.bottleneck",
                area=_area_name(names, cell.area_id),
                status=cell.status.value,
                count=cell.count,
                median=cell.median_count,
                avg_hours=None if cell.avg_hours is None else round(cell.avg_hours, 1),
                sla_max_hours=None if cell.sla_max_hours is None else round(cell.sla_max_hours, 1),
            ),
        )
        for cell in flagged
    ]
    if totals.overdue:
        findings.append(
            FindingRead(
                type=FindingType.SLA,
                evidence=_code("ai.rules.finding.overdue", count=totals.overdue),
            )
        )
    if totals.stalled:
        findings.append(
            FindingRead(
                type=FindingType.DELAY,
                evidence=_code("ai.rules.finding.stalled", count=totals.stalled),
            )
        )
    recommendations = [
        RecommendationRead(
            title=_code(
                "ai.rules.recommendation.bottleneck.title",
                area=_area_name(names, cell.area_id),
                status=cell.status.value,
            ),
            detail=_code(
                "ai.rules.recommendation.bottleneck.detail",
                area=_area_name(names, cell.area_id),
                status=cell.status.value,
                count=cell.count,
            ),
            priority=_bottleneck_priority(len(cell.reasons)),
            target=TargetRead(area_id=cell.area_id, status=cell.status),
        )
        for cell in flagged[:RULE_BOTTLENECK_RECOMMENDATIONS]
    ]
    risky = [risk for risk in context.top_risks if risk.score >= AUTOMATIC_ANALYSIS_THRESHOLD]
    recommendations += [
        RecommendationRead(
            title=_code("ai.rules.recommendation.request.title", code=risk.code),
            detail=_code(
                "ai.rules.recommendation.request.detail",
                code=risk.code,
                score=risk.score,
                factor=(risk.top_factors(1) or [RiskFactor.SLA_CONSUMED])[0].value,
            ),
            priority=RecommendationPriority.HIGH,
            target=TargetRead(request_id=risk.request_id, request_code=risk.code),
        )
        for risk in risky[:RULE_REQUEST_RECOMMENDATIONS]
    ]
    return OverviewInsightContent(
        summary=_code(
            "ai.rules.overview.summary",
            open=totals.open,
            overdue=totals.overdue,
            due_soon=totals.due_soon,
            stalled=totals.stalled,
            bottlenecks=len(flagged),
        ),
        findings=findings[:MAX_FINDINGS],
        recommendations=recommendations[:MAX_RECOMMENDATIONS],
    )


def scope_from(
    risks: Sequence[tuple[str, uuid.UUID]], area_ids: Sequence[uuid.UUID]
) -> OverviewScope:
    return OverviewScope(
        request_ids={code.upper(): request_id for code, request_id in risks},
        area_ids=frozenset(area_ids),
    )
