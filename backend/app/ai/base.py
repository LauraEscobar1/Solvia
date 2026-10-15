from enum import StrEnum
from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

from app.core.config import AIProviderName
from app.models.enums import RequestStatus
from app.schemas.health import AIProviderHealth

Language = Literal["es", "en"]


class RiskLevel(StrEnum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class RequestMetrics(BaseModel):
    model_config = ConfigDict(frozen=True)

    status: RequestStatus
    hours_open: float = Field(ge=0, description="Horas desde que se recibió")
    hours_in_status: float = Field(ge=0, description="Horas en el estado actual")
    sla_hours: float = Field(gt=0, description="Plazo objetivo de resolución en horas")
    reassignment_count: int = Field(default=0, ge=0)
    assignee_open_requests: int | None = Field(
        default=None, ge=0, description="Solicitudes abiertas de la persona asignada"
    )


class AnalysisResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    risk_score: float = Field(ge=0, le=1)
    risk_level: RiskLevel
    summary: str | None = Field(
        default=None,
        description="Explicación generada por la IA en el idioma pedido; `None` en el heurístico",
    )
    provider: AIProviderName


class AIProvider(Protocol):
    async def analyze_request(
        self, metrics: RequestMetrics, language: Language
    ) -> AnalysisResult: ...

    def health(self) -> AIProviderHealth: ...

    async def aclose(self) -> None: ...
