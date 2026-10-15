import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.enums import UILanguage, UITheme, UserRole


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
