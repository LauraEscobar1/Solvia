import uuid

from pydantic import BaseModel, Field, JsonValue

from app.ai.base import FindingType, RecommendationPriority
from app.models.enums import RequestStatus


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
    summary: Message
    findings: list[FindingRead]
    recommendations: list[RecommendationRead]
