from datetime import datetime
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import UILanguage, UITheme
from app.schemas.user import UserRead

Password = Annotated[str, Field(min_length=12, max_length=128)]


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)


class RefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=256)


class LogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=256)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int
    refresh_token: str
    refresh_expires_at: datetime
    user: UserRead


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    language: UILanguage | None = None
    theme: UITheme | None = None
    current_password: str | None = Field(default=None, max_length=128)
    new_password: Password | None = None

    @model_validator(mode="after")
    def _require_current_password(self) -> Self:
        if self.new_password is not None and not self.current_password:
            raise PydanticCustomError("current_password_required", "current_password is required")
        return self
