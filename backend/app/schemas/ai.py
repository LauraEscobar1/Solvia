import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, JsonValue

from app.ai.base import FindingType, RecommendationPriority
from app.ai.risk_model import ReferenceKind, RiskFactor
from app.core.config import AIProviderName
from app.models.enums import InsightSource, InsightTrigger, RequestStatus, UILanguage


class Message(BaseModel):
    text: str | None = None
    code: str | None = None
    params: dict[str, JsonValue] = Field(default_factory=dict)


class ActionRead(BaseModel):
    title: Message
    detail: Message


class RequestInsightContent(BaseModel):
    risk_score: int
    summary: Message
    causes: list[Message]
    actions: list[ActionRead]


class FindingRead(BaseModel):
    type: FindingType
    area_id: uuid.UUID | None = None
    status: RequestStatus | None = None
    evidence: Message


class TargetRead(BaseModel):
    request_id: uuid.UUID | None = None
    request_code: str | None = None
    area_id: uuid.UUID | None = None
    status: RequestStatus | None = None


class RecommendationRead(BaseModel):
    title: Message
    detail: Message
    priority: RecommendationPriority
    target: TargetRead | None = None


class OverviewInsightContent(BaseModel):
    headline: Message | None = None
    summary: Message
    findings: list[FindingRead]
    recommendations: list[RecommendationRead]


class RiskFactorRead(BaseModel):
    factor: RiskFactor
    value: float | str | None
    reference: float | None
    reference_kind: ReferenceKind | None
    normalized: float
    weight: float
    points: float


class RiskRead(BaseModel):
    score: int
    factors: list[RiskFactorRead]


class InsightMeta(BaseModel):
    id: uuid.UUID
    source: InsightSource
    trigger: InsightTrigger
    language: UILanguage
    provider: str
    model: str | None
    tokens_used: int
    fallback_reason: str | None
    cached: bool
    created_at: datetime
    feedback: dict[int, bool] = Field(default_factory=dict)


class RequestInsightRead(InsightMeta):
    content: RequestInsightContent


class RequestAnalysisRead(BaseModel):
    request_id: uuid.UUID
    risk: RiskRead | None
    insight: RequestInsightRead | None
    notice: str | None


class OverviewInsightRead(InsightMeta):
    area_id: uuid.UUID | None
    content: OverviewInsightContent


class OverviewRead(BaseModel):
    area_id: uuid.UUID | None
    insight: OverviewInsightRead | None
    notice: str | None


class LanguageQuery(BaseModel):
    language: UILanguage | None = None


class OverviewQuery(LanguageQuery):
    area_id: uuid.UUID | None = None


class FeedbackInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    item: int = Field(ge=0)
    useful: bool


class DailyRunRead(BaseModel):
    created_at: datetime
    source: InsightSource
    fallback_reason: str | None
    tokens_used: int
    model: str | None


class AIStatusRead(BaseModel):
    provider: AIProviderName
    request_model: str | None
    overview_model: str | None
    key_configured: bool
    automatic_enabled: bool
    send_request_text: bool
    tokens_used_today: int
    daily_token_budget: int
    budget_exceeded: bool
    user_hourly_limit: int
    last_daily_run: DailyRunRead | None
