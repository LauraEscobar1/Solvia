import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.request_event import RequestEvent
from app.repositories.base import BaseRepository


class RequestEventRepository(BaseRepository[RequestEvent]):
    model = RequestEvent

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
