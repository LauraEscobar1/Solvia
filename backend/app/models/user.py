import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, String, false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import UILanguage, UITheme, UserRole
from app.models.types import UI_LANGUAGE, UI_THEME, USER_ROLE

if TYPE_CHECKING:
    from app.models.area import Area


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("email = lower(email)", name="email_lowercase"),)

    full_name: Mapped[str] = mapped_column(String(150))
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(USER_ROLE, index=True)
    area_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("areas.id"), index=True)
    language: Mapped[UILanguage] = mapped_column(
        UI_LANGUAGE, default=UILanguage.ES, server_default=UILanguage.ES.value
    )
    theme: Mapped[UITheme] = mapped_column(
        UI_THEME, default=UITheme.SYSTEM, server_default=UITheme.SYSTEM.value
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())
    must_change_password: Mapped[bool] = mapped_column(default=False, server_default=false())
    last_login_at: Mapped[datetime | None]

    area: Mapped["Area | None"] = relationship(foreign_keys=[area_id], lazy="selectin")
