from enum import StrEnum

from sqlalchemy import Enum

from app.models.enums import (
    AlertSeverity,
    AlertSource,
    AlertType,
    InsightScope,
    InsightSource,
    InsightTrigger,
    RequestEventType,
    RequestPriority,
    RequestStatus,
    UILanguage,
    UITheme,
    UserRole,
)


def pg_enum(enum_class: type[StrEnum], name: str) -> Enum:
    return Enum(
        enum_class,
        name=name,
        values_callable=lambda members: [member.value for member in members],
        validate_strings=True,
    )


REQUEST_PRIORITY = pg_enum(RequestPriority, "request_priority")
REQUEST_STATUS = pg_enum(RequestStatus, "request_status")
USER_ROLE = pg_enum(UserRole, "user_role")
UI_LANGUAGE = pg_enum(UILanguage, "ui_language")
UI_THEME = pg_enum(UITheme, "ui_theme")
REQUEST_EVENT_TYPE = pg_enum(RequestEventType, "request_event_type")
ALERT_TYPE = pg_enum(AlertType, "alert_type")
ALERT_SEVERITY = pg_enum(AlertSeverity, "alert_severity")
ALERT_SOURCE = pg_enum(AlertSource, "alert_source")
INSIGHT_SCOPE = pg_enum(InsightScope, "insight_scope")
INSIGHT_SOURCE = pg_enum(InsightSource, "insight_source")
INSIGHT_TRIGGER = pg_enum(InsightTrigger, "insight_trigger")
