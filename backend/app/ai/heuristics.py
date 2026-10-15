from app.ai.base import RequestMetrics, RiskLevel
from app.models.enums import CLOSED_STATUSES

_RISK_THRESHOLDS: tuple[tuple[float, RiskLevel], ...] = (
    (0.9, RiskLevel.CRITICAL),
    (0.7, RiskLevel.HIGH),
    (0.4, RiskLevel.MEDIUM),
)


def heuristic_risk_score(metrics: RequestMetrics) -> float:
    if metrics.status in CLOSED_STATUSES:
        return 0.0
    return round(min(metrics.hours_open / metrics.sla_hours, 1.0), 4)


def risk_level_for(score: float) -> RiskLevel:
    for threshold, level in _RISK_THRESHOLDS:
        if score >= threshold:
            return level
    return RiskLevel.LOW
