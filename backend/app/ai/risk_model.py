from collections.abc import Mapping
from enum import StrEnum
from types import MappingProxyType
from typing import Final

from app.models.enums import RequestPriority


class RiskFactor(StrEnum):
    STAGE_DELAY = "stage_delay"
    SLA_CONSUMED = "sla_consumed"
    INACTIVITY = "inactivity"
    PRIORITY = "priority"
    ASSIGNEE_LOAD = "assignee_load"


class ReferenceKind(StrEnum):
    P90_AREA = "p90_area_stage_priority"
    P90_STAGE = "p90_stage_priority"
    SLA_MAX = "sla_max"


RISK_WEIGHTS: Final[Mapping[RiskFactor, float]] = MappingProxyType(
    {
        RiskFactor.STAGE_DELAY: 0.25,
        RiskFactor.SLA_CONSUMED: 0.30,
        RiskFactor.INACTIVITY: 0.20,
        RiskFactor.PRIORITY: 0.15,
        RiskFactor.ASSIGNEE_LOAD: 0.10,
    }
)

STAGE_DELAY_CAP: Final = 1.5
SLA_CONSUMED_CAP: Final = 1.5
INACTIVITY_CAP: Final = 2.0
ASSIGNEE_LOAD_REFERENCE: Final = 10
UNASSIGNED_WITHIN_NORMAL: Final = 0.5
UNASSIGNED_DELAYED: Final = 1.0

PRIORITY_VALUES: Final[Mapping[RequestPriority, float]] = MappingProxyType(
    {
        RequestPriority.CRITICAL: 1.0,
        RequestPriority.HIGH: 0.7,
        RequestPriority.MEDIUM: 0.4,
        RequestPriority.LOW: 0.1,
    }
)

BASELINE_PERCENTILE: Final = 0.9
BASELINE_WINDOW_DAYS: Final = 90
BASELINE_MIN_SAMPLES: Final = 10

HIGH_RISK_SCORE: Final = 70
AUTOMATIC_ANALYSIS_THRESHOLD: Final = 70
AI_ALERT_THRESHOLD: Final = 80
AI_ALERT_CRITICAL_THRESHOLD: Final = 90
