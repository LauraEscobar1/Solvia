"""tipo de alerta ai_risk

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-16 11:00:00.000000+00:00
"""

from collections.abc import Sequence

from alembic import op

revision: str = "0007"
down_revision: str | Sequence[str] | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PREVIOUS_VALUES = "'due_soon', 'overdue', 'stalled', 'bottleneck'"


def upgrade() -> None:
    op.execute("ALTER TYPE alert_type ADD VALUE IF NOT EXISTS 'ai_risk'")


def downgrade() -> None:
    op.execute("DELETE FROM alerts WHERE type = 'ai_risk'")
    op.execute("DROP INDEX IF EXISTS uq_alerts_open_bottleneck")
    op.execute("ALTER TYPE alert_type RENAME TO alert_type_with_ai")
    op.execute(f"CREATE TYPE alert_type AS ENUM ({PREVIOUS_VALUES})")
    op.execute("ALTER TABLE alerts ALTER COLUMN type TYPE alert_type USING type::text::alert_type")
    op.execute("DROP TYPE alert_type_with_ai")
    op.execute(
        "CREATE UNIQUE INDEX uq_alerts_open_bottleneck ON alerts (area_id, (params ->> 'status')) "
        "WHERE resolved_at IS NULL AND type = 'bottleneck'"
    )
