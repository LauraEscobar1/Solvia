import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, EmailStr, Field, StringConstraints

from app.models.enums import UILanguage, UITheme, UserRole
from app.schemas.common import PageQuery

FullName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=150)]
Password = Annotated[str, Field(min_length=12, max_length=128)]


class AreaRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    full_name: str
    email: str
    role: UserRole
    area: AreaRef | None
    language: UILanguage
    theme: UITheme
    is_active: bool
    must_change_password: bool
    last_login_at: datetime | None
    created_at: datetime
    updated_at: datetime


class UserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: FullName
    email: EmailStr
    role: UserRole
    area_id: uuid.UUID | None = None
    language: UILanguage = UILanguage.ES
    temporary_password: Password


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: FullName | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    area_id: uuid.UUID | None = None
    temporary_password: Password | None = None


class UserListQuery(PageQuery):
    role: UserRole | None = None
    area_id: uuid.UUID | None = None
    is_active: bool | None = None
