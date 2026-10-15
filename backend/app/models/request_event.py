import uuid

from sqlalchemy import ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDMixin
from app.models.enums import RequestEventType, RequestStatus
from app.models.types import REQUEST_EVENT_TYPE, REQUEST_STATUS


class RequestEvent(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "request_events"
    __table_args__ = (Index("ix_request_events_request_id_created_at", "request_id", "created_at"),)

    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"))
    type: Mapped[RequestEventType] = mapped_column(REQUEST_EVENT_TYPE)
    from_status: Mapped[RequestStatus | None] = mapped_column(REQUEST_STATUS)
    to_status: Mapped[RequestStatus | None] = mapped_column(REQUEST_STATUS)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"), index=True)
    comment: Mapped[str | None] = mapped_column(Text)
