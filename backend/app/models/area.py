import uuid
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.user import User


class Area(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "areas"

    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text)
    manager_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", use_alter=True), index=True
    )
    is_active: Mapped[bool] = mapped_column(default=True, server_default=true())

    manager: Mapped["User | None"] = relationship(foreign_keys=[manager_id], lazy="raise")


Index("uq_areas_name_lower", func.lower(Area.name), unique=True)
