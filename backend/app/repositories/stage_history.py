from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, Select, and_, func, select

from app.models.request import ServiceRequest
from app.models.request_event import RequestEvent


def status_change() -> ColumnElement[bool]:
    return and_(
        RequestEvent.to_status.is_not(None),
        RequestEvent.from_status.is_distinct_from(RequestEvent.to_status),
    )


def stage_entered_at() -> ColumnElement[datetime]:
    entered = (
        select(func.max(RequestEvent.created_at))
        .where(
            RequestEvent.request_id == ServiceRequest.id,
            RequestEvent.to_status == ServiceRequest.status,
            status_change(),
        )
        .scalar_subquery()
    )
    return func.coalesce(entered, ServiceRequest.received_at)


def stage_visits(*conditions: ColumnElement[bool]) -> Select[Any, Any, Any, Any, Any]:
    return (
        select(
            ServiceRequest.area_id,
            ServiceRequest.priority,
            RequestEvent.to_status.label("status"),
            RequestEvent.created_at.label("entered_at"),
            func.lead(RequestEvent.created_at)
            .over(
                partition_by=RequestEvent.request_id,
                order_by=(RequestEvent.created_at, RequestEvent.id),
            )
            .label("left_at"),
        )
        .join(ServiceRequest, ServiceRequest.id == RequestEvent.request_id)
        .where(status_change(), *conditions)
    )
