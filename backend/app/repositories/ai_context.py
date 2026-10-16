import uuid
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, func, select, true
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.area import Area
from app.models.enums import RequestEventType, RequestPriority, RequestStatus
from app.models.request import ServiceRequest
from app.models.request_event import RequestEvent
from app.repositories.stage_history import status_change


@dataclass(frozen=True, slots=True)
class RequestFacts:
    request_id: uuid.UUID
    code: str
    title: str
    description: str
    area_id: uuid.UUID
    area_name: str
    priority: RequestPriority
    status: RequestStatus
    received_at: datetime
    due_at: datetime | None
    last_activity_at: datetime
    has_assignee: bool
    status_changes: int
    returns: int
    reassignments: int
    comments: int


class AIContextRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def request_facts(self, request_id: uuid.UUID) -> RequestFacts | None:
        counts = (
            select(
                func.count()
                .filter(status_change(), RequestEvent.type != RequestEventType.CREATED)
                .label("status_changes"),
                func.count()
                .filter(
                    RequestEvent.from_status == RequestStatus.ASSIGNED,
                    RequestEvent.to_status == RequestStatus.RECEIVED,
                )
                .label("returns"),
                func.count()
                .filter(
                    and_(
                        RequestEvent.type == RequestEventType.ASSIGNED,
                        RequestEvent.from_status == RequestEvent.to_status,
                    )
                )
                .label("reassignments"),
                func.count()
                .filter(RequestEvent.type == RequestEventType.COMMENT)
                .label("comments"),
            )
            .where(RequestEvent.request_id == request_id)
            .subquery()
        )
        row = (
            await self._session.execute(
                select(
                    ServiceRequest.id.label("request_id"),
                    ServiceRequest.code,
                    ServiceRequest.title,
                    ServiceRequest.description,
                    ServiceRequest.area_id,
                    Area.name.label("area_name"),
                    ServiceRequest.priority,
                    ServiceRequest.status,
                    ServiceRequest.received_at,
                    ServiceRequest.due_at,
                    ServiceRequest.last_activity_at,
                    ServiceRequest.assignee_id.is_not(None).label("has_assignee"),
                    counts.c.status_changes,
                    counts.c.returns,
                    counts.c.reassignments,
                    counts.c.comments,
                )
                .join(Area, Area.id == ServiceRequest.area_id)
                .join(counts, true())
                .where(ServiceRequest.id == request_id)
            )
        ).first()
        return None if row is None else RequestFacts(**row._asdict())
