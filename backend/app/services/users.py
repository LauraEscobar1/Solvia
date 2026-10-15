import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import (
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    UnprocessableError,
)
from app.core.security import hash_password
from app.core.time import Clock, utcnow
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.area import AreaRepository
from app.repositories.refresh_token import RefreshTokenRepository
from app.repositories.user import UserRepository
from app.schemas.common import Page
from app.schemas.user import UserCreate, UserListQuery, UserRead, UserUpdate


class UserService:
    def __init__(self, session: AsyncSession, clock: Clock = utcnow) -> None:
        self._session = session
        self._clock = clock
        self._users = UserRepository(session)
        self._areas = AreaRepository(session)
        self._tokens = RefreshTokenRepository(session)

    async def search(self, actor: User, query: UserListQuery) -> Page[UserRead]:
        area_id = query.area_id
        if actor.role is UserRole.SUPERVISOR:
            if actor.area_id is None:
                return Page[UserRead](items=[], total=0, page=query.page, size=query.size)
            area_id = actor.area_id
        elif actor.role is not UserRole.ADMIN:
            raise ForbiddenError
        users, total = await self._users.search(
            q=query.q,
            role=query.role,
            area_id=area_id,
            is_active=query.is_active,
            page=query.page,
            size=query.size,
        )
        return Page[UserRead](
            items=[UserRead.model_validate(user) for user in users],
            total=total,
            page=query.page,
            size=query.size,
        )

    async def get(self, actor: User, user_id: uuid.UUID) -> UserRead:
        user = await self._require(user_id)
        if not self._can_view(actor, user):
            raise ForbiddenError
        return UserRead.model_validate(user)

    async def create(self, data: UserCreate) -> UserRead:
        email = data.email.lower()
        if await self._users.email_exists(email):
            raise ConflictError(ErrorCode.USER_EMAIL_TAKEN)
        await self._validate_area(data.area_id)
        user = await self._users.add(
            User(
                full_name=data.full_name,
                email=email,
                password_hash=hash_password(data.temporary_password),
                role=data.role,
                area_id=data.area_id,
                language=data.language,
                must_change_password=True,
            )
        )
        await self._session.commit()
        return await self._read(user.id)

    async def update(self, user_id: uuid.UUID, data: UserUpdate) -> UserRead:
        user = await self._require(user_id)
        fields = data.model_fields_set
        if data.full_name is not None:
            user.full_name = data.full_name
        if data.email is not None:
            email = data.email.lower()
            if email != user.email and await self._users.email_exists(email, exclude_id=user.id):
                raise ConflictError(ErrorCode.USER_EMAIL_TAKEN)
            user.email = email
        if data.role is not None and data.role is not user.role:
            if user.role is UserRole.ADMIN and user.is_active:
                await self._ensure_another_active_admin(user.id)
            user.role = data.role
        if "area_id" in fields:
            await self._validate_area(data.area_id)
            user.area_id = data.area_id
        if data.temporary_password is not None:
            user.password_hash = hash_password(data.temporary_password)
            user.must_change_password = True
            await self._tokens.revoke_all_for_user(user.id, self._clock())
        await self._session.commit()
        return await self._read(user.id)

    async def set_active(self, actor: User, user_id: uuid.UUID, *, active: bool) -> UserRead:
        if not active and user_id == actor.id:
            raise ConflictError(ErrorCode.USER_CANNOT_DEACTIVATE_SELF)
        user = await self._require(user_id)
        if not active and user.is_active:
            if user.role is UserRole.ADMIN:
                await self._ensure_another_active_admin(user.id)
            await self._tokens.revoke_all_for_user(user.id, self._clock())
        user.is_active = active
        await self._session.commit()
        return await self._read(user.id)

    @staticmethod
    def _can_view(actor: User, user: User) -> bool:
        if actor.role is UserRole.ADMIN or actor.id == user.id:
            return True
        return (
            actor.role is UserRole.SUPERVISOR
            and actor.area_id is not None
            and user.area_id == actor.area_id
        )

    async def _require(self, user_id: uuid.UUID) -> User:
        user = await self._users.get(user_id)
        if user is None:
            raise NotFoundError(ErrorCode.USER_NOT_FOUND)
        return user

    async def _read(self, user_id: uuid.UUID) -> UserRead:
        user = await self._users.get_fresh(user_id)
        if user is None:
            raise NotFoundError(ErrorCode.USER_NOT_FOUND)
        return UserRead.model_validate(user)

    async def _validate_area(self, area_id: uuid.UUID | None) -> None:
        if area_id is None:
            return
        area = await self._areas.get(area_id)
        if area is None or not area.is_active:
            raise UnprocessableError(ErrorCode.USER_INVALID_AREA)

    async def _ensure_another_active_admin(self, user_id: uuid.UUID) -> None:
        admin_ids = await self._users.lock_active_admin_ids()
        if not any(admin_id != user_id for admin_id in admin_ids):
            raise ConflictError(ErrorCode.USER_LAST_ADMIN)
