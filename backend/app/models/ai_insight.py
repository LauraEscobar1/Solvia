import uuid
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, CreatedAtMixin, TimestampMixin, UUIDMixin
from app.models.enums import InsightScope, InsightSource, InsightTrigger, UILanguage
from app.models.types import INSIGHT_SCOPE, INSIGHT_SOURCE, INSIGHT_TRIGGER, UI_LANGUAGE


class AIInsight(UUIDMixin, CreatedAtMixin, Base):
    __tablename__ = "ai_insights"
    __table_args__ = (
        Index("ix_ai_insights_scope_ref_id_created_at", "scope", "ref_id", "created_at"),
        Index(
            "ix_ai_insights_input_hash_language_created_at", "input_hash", "language", "created_at"
        ),
        Index("ix_ai_insights_created_at", "created_at"),
        Index("ix_ai_insights_requested_by_created_at", "requested_by", "created_at"),
        CheckConstraint(
            "risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)",
            name="risk_score_range",
        ),
    )

    scope: Mapped[InsightScope] = mapped_column(INSIGHT_SCOPE)
    ref_id: Mapped[uuid.UUID | None]
    source: Mapped[InsightSource] = mapped_column(INSIGHT_SOURCE)
    trigger: Mapped[InsightTrigger] = mapped_column(INSIGHT_TRIGGER)
    language: Mapped[UILanguage] = mapped_column(UI_LANGUAGE)
    input_hash: Mapped[str] = mapped_column(String(64))
    risk_score: Mapped[int | None]
    content: Mapped[dict[str, Any]] = mapped_column(
        default=dict, server_default=text("'{}'::jsonb")
    )
    fallback_reason: Mapped[str | None] = mapped_column(String(50))
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    provider: Mapped[str] = mapped_column(String(50))
    model: Mapped[str | None] = mapped_column(String(100))
    tokens_used: Mapped[int] = mapped_column(default=0, server_default=text("0"))


class AIFeedback(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ai_feedback"
    __table_args__ = (
        UniqueConstraint("insight_id", "user_id", "item", name="uq_ai_feedback_insight_user_item"),
        CheckConstraint("item >= 0", name="item_not_negative"),
    )

    insight_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ai_insights.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    item: Mapped[int]
    useful: Mapped[bool]
