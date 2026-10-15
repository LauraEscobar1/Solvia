from typing import Any

from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from app.db.base import Base


def contains_text(columns: list[InstrumentedAttribute[Any]], text: str) -> ColumnElement[bool]:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    return or_(*(column.ilike(pattern, escape="\\") for column in columns))


class BaseRepository[ModelT: Base]:
    model: type[ModelT]

    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get(self, primary_key: Any) -> ModelT | None:
        return await self._session.get(self.model, primary_key)

    async def add(self, instance: ModelT) -> ModelT:
        self._session.add(instance)
        await self._session.flush()
        return instance

    async def delete(self, instance: ModelT) -> None:
        await self._session.delete(instance)
        await self._session.flush()

    async def paginate(
        self, statement: Select[ModelT], *, page: int, size: int
    ) -> tuple[list[ModelT], int]:
        count_statement = select(func.count()).select_from(statement.order_by(None).subquery())
        total = await self._session.scalar(count_statement) or 0
        rows = await self._session.scalars(statement.limit(size).offset((page - 1) * size))
        return list(rows), total
