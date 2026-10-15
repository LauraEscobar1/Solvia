import uuid

from sqlalchemy import exists, func, select
from sqlalchemy.orm import selectinload

from app.models.area import Area
from app.repositories.base import BaseRepository, contains_text


class AreaRepository(BaseRepository[Area]):
    model = Area

    async def get_with_manager(self, area_id: uuid.UUID) -> Area | None:
        return await self._session.scalar(
            select(Area)
            .options(selectinload(Area.manager))
            .where(Area.id == area_id)
            .execution_options(populate_existing=True)
        )

    async def search(
        self, *, q: str | None, is_active: bool | None, page: int, size: int
    ) -> tuple[list[Area], int]:
        statement = select(Area).options(selectinload(Area.manager))
        if q:
            statement = statement.where(contains_text([Area.name, Area.description], q))
        if is_active is not None:
            statement = statement.where(Area.is_active.is_(is_active))
        statement = statement.order_by(func.lower(Area.name), Area.id)
        return await self.paginate(statement, page=page, size=size)

    async def name_exists(self, name: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        condition = func.lower(Area.name) == name.lower()
        if exclude_id is not None:
            condition = condition & (Area.id != exclude_id)
        return bool(await self._session.scalar(select(exists().where(condition))))
