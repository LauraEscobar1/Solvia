from sqlalchemy import select

from app.models.sla_policy import SlaPolicy
from app.repositories.base import BaseRepository


class SlaPolicyRepository(BaseRepository[SlaPolicy]):
    model = SlaPolicy

    async def list_ordered(self) -> list[SlaPolicy]:
        rows = await self._session.scalars(
            select(SlaPolicy).order_by(SlaPolicy.priority.desc(), SlaPolicy.status)
        )
        return list(rows)
