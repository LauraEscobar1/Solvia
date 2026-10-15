import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, StringConstraints

from app.schemas.common import PageQuery

AreaName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
AreaDescription = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class UserRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str


class AreaRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    description: str | None
    manager: UserRef | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class AreaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: AreaName
    description: AreaDescription | None = None
    manager_id: uuid.UUID | None = None


class AreaUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: AreaName | None = None
    description: AreaDescription | None = None
    manager_id: uuid.UUID | None = None


class AreaListQuery(PageQuery):
    is_active: bool | None = None
