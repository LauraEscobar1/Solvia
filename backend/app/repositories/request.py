import uuid

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.request import ServiceRequest
from app.repositories.base import BaseRepository

REQUEST_RELATIONS = (
    selectinload(ServiceRequest.area),
    selectinload(ServiceRequest.requester),
    selectinload(ServiceRequest.assignee),
)


class RequestRepository(BaseRepository[ServiceRequest]):
    model = ServiceRequest

    async def get_with_relations(self, request_id: uuid.UUID) -> ServiceRequest | None:
        return await self._session.scalar(
            select(ServiceRequest)
            .options(*REQUEST_RELATIONS)
            .where(ServiceRequest.id == request_id)
            .execution_options(populate_existing=True)
        )

    async def get_for_update(self, request_id: uuid.UUID) -> ServiceRequest | None:
        return await self._session.scalar(
            select(ServiceRequest)
            .where(ServiceRequest.id == request_id)
            .with_for_update(of=ServiceRequest)
            .execution_options(populate_existing=True)
        )
