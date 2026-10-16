import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, UUIDMixin
from app.models.enums import RequestPriority, RequestStatus
from app.models.types import REQUEST_PRIORITY, REQUEST_STATUS


class RiskBaseline(UUIDMixin, Base):
    __tablename__ = "risk_baselines"
    __table_args__ = (
        Index(
            "uq_risk_baselines_cell",
            "area_id",
            "status",
            "priority",
            unique=True,
            postgresql_nulls_not_distinct=True,
        ),
    )

    area_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("areas.id", ondelete="CASCADE"))
    status: Mapped[RequestStatus] = mapped_column(REQUEST_STATUS)
    priority: Mapped[RequestPriority] = mapped_column(REQUEST_PRIORITY)
    p90_hours: Mapped[float]
    sample_size: Mapped[int]
    computed_at: Mapped[datetime]
