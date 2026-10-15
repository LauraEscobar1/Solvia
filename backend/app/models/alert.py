import uuid
from typing import Any

from sqlalchemy import ForeignKey, Index, String, false, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDMixin
from app.models.enums import AlertSeverity, AlertSource, AlertType
from app.models.types import ALERT_SEVERITY, ALERT_SOURCE, ALERT_TYPE


class Alert(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (Index("ix_alerts_is_read_created_at", "is_read", "created_at"),)

    request_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[AlertType] = mapped_column(ALERT_TYPE)
    severity: Mapped[AlertSeverity] = mapped_column(ALERT_SEVERITY)
    source: Mapped[AlertSource] = mapped_column(ALERT_SOURCE)
    message_code: Mapped[str] = mapped_column(String(100))
    params: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    is_read: Mapped[bool] = mapped_column(default=False, server_default=false())
