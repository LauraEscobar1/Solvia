from datetime import datetime
from typing import Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import SLA_STAGES, RequestPriority, RequestStatus

MAX_SLA_HOURS = 24 * 365


class SlaPolicyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    priority: RequestPriority
    status: RequestStatus
    max_hours: int
    inactivity_hours: int
    updated_at: datetime


class SlaPolicyItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    priority: RequestPriority
    status: RequestStatus
    max_hours: int = Field(gt=0, le=MAX_SLA_HOURS)
    inactivity_hours: int = Field(gt=0, le=MAX_SLA_HOURS)

    @field_validator("status")
    @classmethod
    def _open_stage(cls, value: RequestStatus) -> RequestStatus:
        if value not in SLA_STAGES:
            raise PydanticCustomError("sla_stage", "status must be an open stage")
        return value

    @model_validator(mode="after")
    def _inactivity_within_max(self) -> Self:
        if self.inactivity_hours > self.max_hours:
            raise PydanticCustomError(
                "inactivity_exceeds_max", "inactivity_hours must not exceed max_hours"
            )
        return self
