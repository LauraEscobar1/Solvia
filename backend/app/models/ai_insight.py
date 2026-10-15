import uuid
from typing import Any

from sqlalchemy import CheckConstraint, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, UUIDMixin
from app.models.enums import InsightScope
from app.models.types import INSIGHT_SCOPE


class AIInsight(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "ai_insights"
    __table_args__ = (
        Index("ix_ai_insights_scope_ref_id_created_at", "scope", "ref_id", "created_at"),
        CheckConstraint("risk_score >= 0 AND risk_score <= 1", name="risk_score_range"),
    )

    scope: Mapped[InsightScope] = mapped_column(INSIGHT_SCOPE)
    ref_id: Mapped[uuid.UUID | None]
    risk_score: Mapped[float]
    summary: Mapped[str] = mapped_column(Text)
    recommendations: Mapped[list[Any]] = mapped_column(
        default=list, server_default=text("'[]'::jsonb")
    )
    provider: Mapped[str] = mapped_column(String(50))
    model: Mapped[str | None] = mapped_column(String(100))
    tokens_used: Mapped[int | None]
