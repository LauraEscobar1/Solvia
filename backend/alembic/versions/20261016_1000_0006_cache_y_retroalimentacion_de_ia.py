"""caché de análisis de IA y retroalimentación

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-16 10:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0006"
down_revision: str | Sequence[str] | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

INSIGHT_SOURCE = postgresql.ENUM("rule", "ai", name="insight_source")
INSIGHT_TRIGGER = postgresql.ENUM("manual", "automatic", "scheduled", name="insight_trigger")


def _existing(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(name=name, create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    INSIGHT_SOURCE.create(bind)
    INSIGHT_TRIGGER.create(bind)

    op.drop_constraint("ck_ai_insights_risk_score_range", "ai_insights", type_="check")
    op.alter_column(
        "ai_insights",
        "risk_score",
        type_=sa.Integer(),
        nullable=True,
        postgresql_using="round(risk_score * 100)::integer",
    )
    op.create_check_constraint(
        "ck_ai_insights_risk_score_range",
        "ai_insights",
        "risk_score IS NULL OR (risk_score >= 0 AND risk_score <= 100)",
    )
    op.drop_column("ai_insights", "summary")
    op.drop_column("ai_insights", "recommendations")
    op.execute("DELETE FROM ai_insights")
    op.add_column("ai_insights", sa.Column("source", _existing("insight_source"), nullable=False))
    op.add_column("ai_insights", sa.Column("trigger", _existing("insight_trigger"), nullable=False))
    op.add_column("ai_insights", sa.Column("language", _existing("ui_language"), nullable=False))
    op.add_column("ai_insights", sa.Column("input_hash", sa.String(64), nullable=False))
    op.add_column(
        "ai_insights",
        sa.Column(
            "content",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("ai_insights", sa.Column("fallback_reason", sa.String(50)))
    op.add_column("ai_insights", sa.Column("requested_by", sa.Uuid()))
    op.create_foreign_key(
        "fk_ai_insights_requested_by_users",
        "ai_insights",
        "users",
        ["requested_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.execute("UPDATE ai_insights SET tokens_used = 0 WHERE tokens_used IS NULL")
    op.alter_column(
        "ai_insights",
        "tokens_used",
        nullable=False,
        server_default=sa.text("0"),
    )
    op.create_index(
        "ix_ai_insights_input_hash_language_created_at",
        "ai_insights",
        ["input_hash", "language", "created_at"],
    )
    op.create_index("ix_ai_insights_created_at", "ai_insights", ["created_at"])
    op.create_index(
        "ix_ai_insights_requested_by_created_at",
        "ai_insights",
        ["requested_by", "created_at"],
    )

    op.create_table(
        "ai_feedback",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("insight_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("item", sa.Integer(), nullable=False),
        sa.Column("useful", sa.Boolean(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ai_feedback"),
        sa.ForeignKeyConstraint(
            ["insight_id"],
            ["ai_insights.id"],
            name="fk_ai_feedback_insight_id_ai_insights",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_ai_feedback_user_id_users",
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "insight_id", "user_id", "item", name="uq_ai_feedback_insight_user_item"
        ),
        sa.CheckConstraint("item >= 0", name="ck_ai_feedback_item_not_negative"),
    )
    op.create_index("ix_ai_feedback_user_id", "ai_feedback", ["user_id"])


def downgrade() -> None:
    op.drop_table("ai_feedback")
    op.drop_index("ix_ai_insights_requested_by_created_at", table_name="ai_insights")
    op.drop_index("ix_ai_insights_created_at", table_name="ai_insights")
    op.drop_index("ix_ai_insights_input_hash_language_created_at", table_name="ai_insights")
    op.execute("DELETE FROM ai_insights")
    op.alter_column("ai_insights", "tokens_used", nullable=True, server_default=None)
    op.drop_constraint("fk_ai_insights_requested_by_users", "ai_insights", type_="foreignkey")
    for column in (
        "requested_by",
        "fallback_reason",
        "content",
        "input_hash",
        "language",
        "trigger",
        "source",
    ):
        op.drop_column("ai_insights", column)
    op.add_column("ai_insights", sa.Column("summary", sa.Text(), nullable=False))
    op.add_column(
        "ai_insights",
        sa.Column(
            "recommendations",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.drop_constraint("ck_ai_insights_risk_score_range", "ai_insights", type_="check")
    op.alter_column(
        "ai_insights",
        "risk_score",
        type_=sa.Float(),
        nullable=False,
        postgresql_using="risk_score / 100.0",
    )
    op.create_check_constraint(
        "ck_ai_insights_risk_score_range",
        "ai_insights",
        "risk_score >= 0 AND risk_score <= 1",
    )
    bind = op.get_bind()
    INSIGHT_TRIGGER.drop(bind)
    INSIGHT_SOURCE.drop(bind)
