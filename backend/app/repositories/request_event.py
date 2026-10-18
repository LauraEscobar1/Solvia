import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.enums import RequestStatus
from app.models.request_event import RequestEvent
from app.repositories.base import BaseRepository
from app.repositories.stage_history import status_change


class RequestEventRepository(BaseRepository[RequestEvent]):
    model = RequestEvent

    async def status_changes(self, request_id: uuid.UUID) -> list[tuple[RequestStatus, datetime]]:
        rows = await self._session.execute(
            select(RequestEvent.to_status, RequestEvent.created_at)
            .where(RequestEvent.request_id == request_id, status_change())
            .order_by(RequestEvent.created_at, RequestEvent.id)
        )
        return [(status, at) for status, at in rows if status is not None]

    async def list_for_request(
        self, request_id: uuid.UUID, *, page: int, size: int
    ) -> tuple[list[RequestEvent], int]:
        statement = (
            select(RequestEvent)
            .options(selectinload(RequestEvent.actor))
            .where(RequestEvent.request_id == request_id)
            .order_by(RequestEvent.created_at.desc(), RequestEvent.id.desc())
        )
        return await self.paginate(statement, page=page, size=size)
