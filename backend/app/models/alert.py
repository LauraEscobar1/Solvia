import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDMixin
from app.models.enums import AlertSeverity, AlertSource, AlertType
from app.models.types import ALERT_SEVERITY, ALERT_SOURCE, ALERT_TYPE

OPEN_REQUEST_ALERT_SQL = "resolved_at IS NULL AND request_id IS NOT NULL"
OPEN_BOTTLENECK_ALERT_SQL = "resolved_at IS NULL AND type = 'bottleneck'"


class Alert(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "alerts"
    __table_args__ = (
        Index("ix_alerts_created_at", "created_at"),
        Index(
            "uq_alerts_open_request_type",
            "request_id",
            "type",
            unique=True,
            postgresql_where=text(OPEN_REQUEST_ALERT_SQL),
        ),
    )

    request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("requests.id", ondelete="CASCADE"), index=True
    )
    area_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("areas.id", ondelete="CASCADE"), index=True
    )
    type: Mapped[AlertType] = mapped_column(ALERT_TYPE)
    severity: Mapped[AlertSeverity] = mapped_column(ALERT_SEVERITY)
    source: Mapped[AlertSource] = mapped_column(ALERT_SOURCE)
    message_code: Mapped[str] = mapped_column(String(100))
    params: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    resolved_at: Mapped[datetime | None]


Index(
    "uq_alerts_open_bottleneck",
    Alert.area_id,
    Alert.params["status"].astext,
    unique=True,
    postgresql_where=text(OPEN_BOTTLENECK_ALERT_SQL),
)


class AlertReceipt(Base):
    __tablename__ = "alert_reads"

    alert_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("alerts.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    read_at: Mapped[datetime] = mapped_column(server_default=func.now())
