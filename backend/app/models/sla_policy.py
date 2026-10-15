from sqlalchemy import CheckConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin
from app.models.enums import RequestPriority, RequestStatus
from app.models.types import REQUEST_PRIORITY, REQUEST_STATUS


class SlaPolicy(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "sla_policies"
    __table_args__ = (
        UniqueConstraint("priority", "status", name="uq_sla_policies_priority_status"),
        CheckConstraint("max_hours > 0", name="max_hours_positive"),
        CheckConstraint(
            "inactivity_hours > 0 AND inactivity_hours <= max_hours",
            name="inactivity_within_max",
        ),
        CheckConstraint(
            "status IN ('received', 'assigned', 'in_progress')",
            name="open_stage",
        ),
    )

    priority: Mapped[RequestPriority] = mapped_column(REQUEST_PRIORITY)
    status: Mapped[RequestStatus] = mapped_column(REQUEST_STATUS)
    max_hours: Mapped[int]
    inactivity_hours: Mapped[int]
