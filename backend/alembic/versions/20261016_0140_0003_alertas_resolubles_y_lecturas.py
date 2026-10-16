"""alertas resolubles, por área y con lectura por usuario

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-16 01:40:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0003"
down_revision: str | Sequence[str] | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OPEN_REQUEST_ALERT_SQL = "resolved_at IS NULL AND request_id IS NOT NULL"
OPEN_BOTTLENECK_ALERT_SQL = "resolved_at IS NULL AND type = 'bottleneck'"


def upgrade() -> None:
    op.add_column("alerts", sa.Column("area_id", sa.Uuid()))
    op.execute(
        "UPDATE alerts SET area_id = requests.area_id "
        "FROM requests WHERE requests.id = alerts.request_id"
    )
    op.alter_column("alerts", "area_id", nullable=False)
    op.create_foreign_key(
        "fk_alerts_area_id_areas", "alerts", "areas", ["area_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_alerts_area_id", "alerts", ["area_id"])

    op.add_column("alerts", sa.Column("resolved_at", sa.DateTime(timezone=True)))
    op.alter_column("alerts", "request_id", nullable=True)
    op.drop_index("ix_alerts_is_read_created_at", table_name="alerts")
    op.drop_column("alerts", "is_read")
    op.create_index("ix_alerts_created_at", "alerts", ["created_at"])
    op.create_index(
        "uq_alerts_open_request_type",
        "alerts",
        ["request_id", "type"],
        unique=True,
        postgresql_where=sa.text(OPEN_REQUEST_ALERT_SQL),
    )
    op.create_index(
        "uq_alerts_open_bottleneck",
        "alerts",
        ["area_id", sa.text("(params ->> 'status')")],
        unique=True,
        postgresql_where=sa.text(OPEN_BOTTLENECK_ALERT_SQL),
    )

    op.create_table(
        "alert_reads",
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column(
            "read_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("alert_id", "user_id", name="pk_alert_reads"),
        sa.ForeignKeyConstraint(
            ["alert_id"],
            ["alerts.id"],
            name="fk_alert_reads_alert_id_alerts",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_alert_reads_user_id_users",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_alert_reads_user_id", "alert_reads", ["user_id"])


def downgrade() -> None:
    op.drop_table("alert_reads")
    op.drop_index("uq_alerts_open_bottleneck", table_name="alerts")
    op.drop_index("uq_alerts_open_request_type", table_name="alerts")
    op.drop_index("ix_alerts_created_at", table_name="alerts")
    op.add_column(
        "alerts",
        sa.Column("is_read", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.create_index("ix_alerts_is_read_created_at", "alerts", ["is_read", "created_at"])
    op.execute("DELETE FROM alerts WHERE request_id IS NULL")
    op.alter_column("alerts", "request_id", nullable=False)
    op.drop_column("alerts", "resolved_at")
    op.drop_index("ix_alerts_area_id", table_name="alerts")
    op.drop_constraint("fk_alerts_area_id_areas", "alerts", type_="foreignkey")
    op.drop_column("alerts", "area_id")
