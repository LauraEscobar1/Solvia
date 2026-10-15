"""modelo de datos inicial

Revision ID: 0001
Revises:
Create Date: 2026-10-15 16:18:00.000000+00:00
"""

from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision: str = "0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ENUMS: dict[str, tuple[str, ...]] = {
    "request_priority": ("low", "medium", "high", "critical"),
    "request_status": ("received", "assigned", "in_progress", "completed", "cancelled"),
    "user_role": ("admin", "supervisor", "assignee", "requester"),
    "ui_language": ("es", "en"),
    "ui_theme": ("light", "dark", "system"),
    "request_event_type": ("created", "status_changed", "assigned", "comment", "updated"),
    "alert_type": ("due_soon", "overdue", "stalled", "bottleneck"),
    "alert_severity": ("info", "warning", "critical"),
    "alert_source": ("rule", "ai"),
    "insight_scope": ("request", "area", "global"),
}

NEXT_REQUEST_CODE = """
CREATE FUNCTION next_request_code() RETURNS text
LANGUAGE sql VOLATILE AS $$
    SELECT 'SOL-' || CASE WHEN n < 10000 THEN lpad(n::text, 4, '0') ELSE n::text END
    FROM (SELECT nextval('request_code_seq') AS n) AS seq
$$
"""


def _enum(name: str) -> postgresql.ENUM:
    return postgresql.ENUM(*ENUMS[name], name=name, create_type=False)


def _id() -> sa.Column[object]:
    return sa.Column("id", sa.Uuid(), server_default=sa.text("gen_random_uuid()"), nullable=False)


def _created_at() -> sa.Column[object]:
    return sa.Column(
        "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def _updated_at() -> sa.Column[object]:
    return sa.Column(
        "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
    )


def upgrade() -> None:
    bind = op.get_bind()
    for name, values in ENUMS.items():
        postgresql.ENUM(*values, name=name).create(bind)

    op.execute("CREATE SEQUENCE request_code_seq START 1")
    op.execute(NEXT_REQUEST_CODE)

    op.create_table(
        "areas",
        _id(),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("manager_id", sa.Uuid()),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id", name="pk_areas"),
    )
    op.create_index("uq_areas_name_lower", "areas", [sa.text("lower(name)")], unique=True)
    op.create_index("ix_areas_manager_id", "areas", ["manager_id"])

    op.create_table(
        "users",
        _id(),
        sa.Column("full_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("role", _enum("user_role"), nullable=False),
        sa.Column("area_id", sa.Uuid()),
        sa.Column("language", _enum("ui_language"), server_default="es", nullable=False),
        sa.Column("theme", _enum("ui_theme"), server_default="system", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("must_change_password", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.CheckConstraint("email = lower(email)", name="ck_users_email_lowercase"),
        sa.ForeignKeyConstraint(["area_id"], ["areas.id"], name="fk_users_area_id_areas"),
    )
    op.create_index("ix_users_area_id", "users", ["area_id"])
    op.create_index("ix_users_role", "users", ["role"])
    op.create_foreign_key("fk_areas_manager_id_users", "areas", "users", ["manager_id"], ["id"])

    op.create_table(
        "requests",
        _id(),
        sa.Column(
            "code",
            sa.String(20),
            server_default=sa.text("next_request_code()"),
            nullable=False,
        ),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("area_id", sa.Uuid(), nullable=False),
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("assignee_id", sa.Uuid()),
        sa.Column("priority", _enum("request_priority"), nullable=False),
        sa.Column("status", _enum("request_status"), server_default="received", nullable=False),
        sa.Column(
            "received_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column(
            "last_activity_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id", name="pk_requests"),
        sa.UniqueConstraint("code", name="uq_requests_code"),
        sa.ForeignKeyConstraint(["area_id"], ["areas.id"], name="fk_requests_area_id_areas"),
        sa.ForeignKeyConstraint(
            ["requester_id"], ["users.id"], name="fk_requests_requester_id_users"
        ),
        sa.ForeignKeyConstraint(
            ["assignee_id"], ["users.id"], name="fk_requests_assignee_id_users"
        ),
    )
    op.create_index("ix_requests_status_assignee_id", "requests", ["status", "assignee_id"])
    op.create_index("ix_requests_area_id_status", "requests", ["area_id", "status"])
    op.create_index("ix_requests_last_activity_at", "requests", ["last_activity_at"])
    op.create_index("ix_requests_requester_id", "requests", ["requester_id"])

    op.create_table(
        "request_events",
        _id(),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("type", _enum("request_event_type"), nullable=False),
        sa.Column("from_status", _enum("request_status")),
        sa.Column("to_status", _enum("request_status")),
        sa.Column("actor_id", sa.Uuid()),
        sa.Column("comment", sa.Text()),
        _created_at(),
        sa.PrimaryKeyConstraint("id", name="pk_request_events"),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["requests.id"],
            name="fk_request_events_request_id_requests",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name="fk_request_events_actor_id_users"
        ),
    )
    op.create_index(
        "ix_request_events_request_id_created_at", "request_events", ["request_id", "created_at"]
    )
    op.create_index("ix_request_events_actor_id", "request_events", ["actor_id"])

    op.create_table(
        "sla_policies",
        _id(),
        sa.Column("priority", _enum("request_priority"), nullable=False),
        sa.Column("status", _enum("request_status"), nullable=False),
        sa.Column("max_hours", sa.Integer(), nullable=False),
        sa.Column("inactivity_hours", sa.Integer(), nullable=False),
        _created_at(),
        _updated_at(),
        sa.PrimaryKeyConstraint("id", name="pk_sla_policies"),
        sa.UniqueConstraint("priority", "status", name="uq_sla_policies_priority_status"),
        sa.CheckConstraint("max_hours > 0", name="ck_sla_policies_max_hours_positive"),
        sa.CheckConstraint(
            "inactivity_hours > 0 AND inactivity_hours <= max_hours",
            name="ck_sla_policies_inactivity_within_max",
        ),
        sa.CheckConstraint(
            "status IN ('received', 'assigned', 'in_progress')",
            name="ck_sla_policies_open_stage",
        ),
    )

    op.create_table(
        "alerts",
        _id(),
        sa.Column("request_id", sa.Uuid(), nullable=False),
        sa.Column("type", _enum("alert_type"), nullable=False),
        sa.Column("severity", _enum("alert_severity"), nullable=False),
        sa.Column("source", _enum("alert_source"), nullable=False),
        sa.Column("message_code", sa.String(100), nullable=False),
        sa.Column(
            "params",
            postgresql.JSONB(),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("is_read", sa.Boolean(), server_default=sa.false(), nullable=False),
        _created_at(),
        sa.PrimaryKeyConstraint("id", name="pk_alerts"),
        sa.ForeignKeyConstraint(
            ["request_id"],
            ["requests.id"],
            name="fk_alerts_request_id_requests",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_alerts_request_id", "alerts", ["request_id"])
    op.create_index("ix_alerts_is_read_created_at", "alerts", ["is_read", "created_at"])

    op.create_table(
        "ai_insights",
        _id(),
        sa.Column("scope", _enum("insight_scope"), nullable=False),
        sa.Column("ref_id", sa.Uuid()),
        sa.Column("risk_score", sa.Float(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column(
            "recommendations",
            postgresql.JSONB(),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("provider", sa.String(50), nullable=False),
        sa.Column("model", sa.String(100)),
        sa.Column("tokens_used", sa.Integer()),
        _created_at(),
        sa.PrimaryKeyConstraint("id", name="pk_ai_insights"),
        sa.CheckConstraint(
            "risk_score >= 0 AND risk_score <= 1", name="ck_ai_insights_risk_score_range"
        ),
    )
    op.create_index(
        "ix_ai_insights_scope_ref_id_created_at", "ai_insights", ["scope", "ref_id", "created_at"]
    )

    op.create_table(
        "refresh_tokens",
        _id(),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True)),
        _created_at(),
        sa.PrimaryKeyConstraint("id", name="pk_refresh_tokens"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_tokens_token_hash"),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name="fk_refresh_tokens_user_id_users",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])


def downgrade() -> None:
    for table in (
        "refresh_tokens",
        "ai_insights",
        "alerts",
        "sla_policies",
        "request_events",
        "requests",
    ):
        op.drop_table(table)
    op.drop_constraint("fk_areas_manager_id_users", "areas", type_="foreignkey")
    op.drop_table("users")
    op.drop_table("areas")

    op.execute("DROP FUNCTION next_request_code()")
    op.execute("DROP SEQUENCE request_code_seq")

    bind = op.get_bind()
    for name in reversed(list(ENUMS)):
        postgresql.ENUM(name=name).drop(bind)
