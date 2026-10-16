import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Index, String, Text, func, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import RequestPriority, RequestStatus
from app.models.types import REQUEST_PRIORITY, REQUEST_STATUS

if TYPE_CHECKING:
    from app.models.area import Area
    from app.models.user import User

OPEN_STATUS_SQL = "status IN ('received', 'assigned', 'in_progress')"


class ServiceRequest(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "requests"
    __table_args__ = (
        Index("ix_requests_status_assignee_id", "status", "assignee_id"),
        Index("ix_requests_area_id_status", "area_id", "status"),
        Index("ix_requests_last_activity_at", "last_activity_at"),
        Index("ix_requests_assignee_id", "assignee_id"),
        Index("ix_requests_received_at", "received_at"),
        Index("ix_requests_due_at_open", "due_at", postgresql_where=text(OPEN_STATUS_SQL)),
        Index(
            "ix_requests_completed_at",
            "completed_at",
            postgresql_where=text("completed_at IS NOT NULL"),
        ),
    )

    code: Mapped[str] = mapped_column(
        String(20), unique=True, server_default=text("next_request_code()")
    )
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text)
    area_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("areas.id"))
    requester_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"), index=True)
    assignee_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    priority: Mapped[RequestPriority] = mapped_column(REQUEST_PRIORITY)
    status: Mapped[RequestStatus] = mapped_column(
        REQUEST_STATUS,
        default=RequestStatus.RECEIVED,
        server_default=RequestStatus.RECEIVED.value,
    )
    received_at: Mapped[datetime] = mapped_column(server_default=func.now())
    due_at: Mapped[datetime | None]
    last_activity_at: Mapped[datetime] = mapped_column(server_default=func.now())
    completed_at: Mapped[datetime | None]
    version: Mapped[int] = mapped_column(default=1, server_default=text("1"))

    area: Mapped["Area"] = relationship(lazy="raise")
    requester: Mapped["User"] = relationship(foreign_keys=[requester_id], lazy="raise")
    assignee: Mapped["User | None"] = relationship(foreign_keys=[assignee_id], lazy="raise")
