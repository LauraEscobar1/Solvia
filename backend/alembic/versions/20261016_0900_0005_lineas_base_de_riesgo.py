"""líneas base de tiempo por etapa para el puntaje de riesgo

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-16 09:00:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0005"
down_revision: str | Sequence[str] | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(name=name, create_type=False)


def upgrade() -> None:
    op.create_table(
        "risk_baselines",
        sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column("area_id", sa.Uuid()),
        sa.Column("status", _enum("request_status"), nullable=False),
        sa.Column("priority", _enum("request_priority"), nullable=False),
        sa.Column("p90_hours", sa.Float(), nullable=False),
        sa.Column("sample_size", sa.Integer(), nullable=False),
        sa.Column("computed_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_risk_baselines"),
        sa.ForeignKeyConstraint(
            ["area_id"],
            ["areas.id"],
            name="fk_risk_baselines_area_id_areas",
            ondelete="CASCADE",
        ),
    )
    op.create_index(
        "uq_risk_baselines_cell",
        "risk_baselines",
        ["area_id", "status", "priority"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    op.drop_table("risk_baselines")
