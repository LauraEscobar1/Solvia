from enum import StrEnum

from pydantic import BaseModel

from app.core.config import AIProviderName, Environment


class HealthStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"


class ComponentStatus(StrEnum):
    OK = "ok"
    UNAVAILABLE = "unavailable"


class DatabaseHealth(BaseModel):
    status: ComponentStatus


class AIProviderHealth(BaseModel):
    provider: AIProviderName
    model: str | None = None
    configured: bool


class OrganizationInfo(BaseModel):
    name: str | None


class HealthResponse(BaseModel):
    status: HealthStatus
    version: str
    environment: Environment
    database: DatabaseHealth
    ai: AIProviderHealth
    organization: OrganizationInfo
