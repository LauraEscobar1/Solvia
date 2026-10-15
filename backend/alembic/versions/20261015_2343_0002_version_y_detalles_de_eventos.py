"""versión de solicitudes y detalles de eventos

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-15 23:43:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0002"
down_revision: str | Sequence[str] | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OPEN_STATUS_SQL = "status IN ('received', 'assigned', 'in_progress')"


def upgrade() -> None:
    op.add_column(
        "requests",
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )
    op.add_column(
        "request_events",
        sa.Column(
            "details",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
    )
    op.create_index("ix_requests_assignee_id", "requests", ["assignee_id"])
    op.create_index("ix_requests_received_at", "requests", ["received_at"])
    op.create_index(
        "ix_requests_due_at_open",
        "requests",
        ["due_at"],
        postgresql_where=sa.text(OPEN_STATUS_SQL),
    )


def downgrade() -> None:
    op.drop_index("ix_requests_due_at_open", table_name="requests")
    op.drop_index("ix_requests_received_at", table_name="requests")
    op.drop_index("ix_requests_assignee_id", table_name="requests")
    op.drop_column("request_events", "details")
    op.drop_column("requests", "version")
