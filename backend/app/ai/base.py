from dataclasses import dataclass
from enum import StrEnum
from typing import Annotated, Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from app.core.config import AIProviderName
from app.models.enums import RequestStatus
from app.schemas.health import AIProviderHealth

Language = Literal["es", "en"]

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=300)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
Detail = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=600)]
Summary = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=800)]

MAX_CAUSES = 3
MAX_ACTIONS = 3
MAX_FINDINGS = 6
MAX_RECOMMENDATIONS = 5


class AnalysisKind(StrEnum):
    REQUEST = "request"
    OVERVIEW = "overview"


class FindingType(StrEnum):
    BOTTLENECK = "bottleneck"
    DELAY = "delay"
    WORKLOAD = "workload"
    TREND = "trend"
    SLA = "sla"


class RecommendationPriority(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class _Output(BaseModel):
    model_config = ConfigDict(extra="ignore", frozen=True)


class ActionItem(_Output):
    title: Title
    detail: Detail


class RequestAnalysis(_Output):
    risk_score: int = Field(ge=0, le=100)
    summary: Summary
    causes: list[ShortText] = Field(default_factory=list, max_length=MAX_CAUSES)
    actions: list[ActionItem] = Field(default_factory=list, max_length=MAX_ACTIONS)


class Finding(_Output):
    type: FindingType
    area_id: str | None = None
    status: RequestStatus | None = None
    evidence: Detail


class Target(_Output):
    request_code: str | None = None
    area_id: str | None = None
    status: RequestStatus | None = None


class Recommendation(_Output):
    title: Title
    detail: Detail
    priority: RecommendationPriority
    target: Target | None = None


class OverviewAnalysis(_Output):
    summary: Summary
    findings: list[Finding] = Field(default_factory=list, max_length=MAX_FINDINGS)
    recommendations: list[Recommendation] = Field(
        default_factory=list, max_length=MAX_RECOMMENDATIONS
    )


class ProviderFailure(StrEnum):
    DISABLED = "disabled"
    UNAVAILABLE = "unavailable"
    RATE_LIMITED = "rate_limited"
    TIMEOUT = "timeout"
    INVALID_RESPONSE = "invalid_response"


class AIProviderError(Exception):
    def __init__(self, reason: ProviderFailure, *, tokens_used: int = 0) -> None:
        super().__init__(reason.value)
        self.reason = reason
        self.tokens_used = tokens_used


@dataclass(frozen=True, slots=True)
class Completion[T]:
    result: T
    model: str
    tokens_used: int


class AIProvider(Protocol):
    name: AIProviderName

    def model_for(self, kind: AnalysisKind) -> str | None: ...

    async def analyze_request(
        self,
        payload: dict[str, Any],
        language: Language,
        *,
        request_text: str | None = None,
        retry_transient: bool = False,
    ) -> Completion[RequestAnalysis]: ...

    async def analyze_overview(
        self,
        payload: dict[str, Any],
        language: Language,
        *,
        retry_transient: bool = False,
    ) -> Completion[OverviewAnalysis]: ...

    def health(self) -> AIProviderHealth: ...

    async def aclose(self) -> None: ...
