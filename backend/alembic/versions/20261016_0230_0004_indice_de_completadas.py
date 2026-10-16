"""índice de solicitudes completadas para el panel

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-16 02:30:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0004"
down_revision: str | Sequence[str] | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_requests_completed_at",
        "requests",
        ["completed_at"],
        postgresql_where=sa.text("completed_at IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_requests_completed_at", table_name="requests")
