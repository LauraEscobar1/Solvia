import uuid
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import RequestPriority, RequestStatus

Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Description = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
CommentText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)
]
OptionalComment = Annotated[str, StringConstraints(strip_whitespace=True, max_length=5000)]
Version = Annotated[int, Field(ge=1)]


class RequestCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: Title
    description: Description
    area_id: uuid.UUID
    priority: RequestPriority


class RequestUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: Version
    title: Title | None = None
    description: Description | None = None
    priority: RequestPriority | None = None
    due_at: AwareDatetime | None = None


class TransitionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    to: RequestStatus
    version: Version
    comment: OptionalComment | None = None
    assignee_id: uuid.UUID | None = None


class AssignInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    assignee_id: uuid.UUID
    version: Version
    comment: OptionalComment | None = None


class CommentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    comment: CommentText
