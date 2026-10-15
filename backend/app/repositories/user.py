import uuid

from sqlalchemy import exists, func, select

from app.models.enums import UserRole
from app.models.user import User
from app.repositories.base import BaseRepository, contains_text


class UserRepository(BaseRepository[User]):
    model = User

    async def get_by_email(self, email: str) -> User | None:
        return await self._session.scalar(select(User).where(User.email == email))

    async def get_fresh(self, user_id: uuid.UUID) -> User | None:
        return await self._session.scalar(
            select(User).where(User.id == user_id).execution_options(populate_existing=True)
        )

    async def search(
        self,
        *,
        q: str | None,
        role: UserRole | None,
        area_id: uuid.UUID | None,
        is_active: bool | None,
        page: int,
        size: int,
    ) -> tuple[list[User], int]:
        statement = select(User)
        if q:
            statement = statement.where(contains_text([User.full_name, User.email], q))
        if role is not None:
            statement = statement.where(User.role == role)
        if area_id is not None:
            statement = statement.where(User.area_id == area_id)
        if is_active is not None:
            statement = statement.where(User.is_active.is_(is_active))
        statement = statement.order_by(func.lower(User.full_name), User.email)
        return await self.paginate(statement, page=page, size=size)

    async def email_exists(self, email: str, *, exclude_id: uuid.UUID | None = None) -> bool:
        condition = User.email == email
        if exclude_id is not None:
            condition = condition & (User.id != exclude_id)
        return bool(await self._session.scalar(select(exists().where(condition))))

    async def lock_active_admin_ids(self) -> list[uuid.UUID]:
        rows = await self._session.scalars(
            select(User.id)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
            .with_for_update()
        )
        return list(rows)
