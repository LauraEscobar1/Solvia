import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, ErrorCode, NotFoundError, UnprocessableError
from app.models.area import Area
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.area import AreaRepository
from app.repositories.user import UserRepository
from app.schemas.area import AreaCreate, AreaListQuery, AreaRead, AreaUpdate
from app.schemas.common import Page

MANAGER_ROLES = frozenset({UserRole.ADMIN, UserRole.SUPERVISOR})


class AreaService:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session
        self._areas = AreaRepository(session)
        self._users = UserRepository(session)

    async def search(self, actor: User, query: AreaListQuery) -> Page[AreaRead]:
        is_active = query.is_active if actor.role is UserRole.ADMIN else True
        areas, total = await self._areas.search(
            q=query.q, is_active=is_active, page=query.page, size=query.size
        )
        return Page[AreaRead](
            items=[AreaRead.model_validate(area) for area in areas],
            total=total,
            page=query.page,
            size=query.size,
        )

    async def get(self, actor: User, area_id: uuid.UUID) -> AreaRead:
        area = await self._areas.get_with_manager(area_id)
        if area is None or (actor.role is not UserRole.ADMIN and not area.is_active):
            raise NotFoundError(ErrorCode.AREA_NOT_FOUND)
        return AreaRead.model_validate(area)

    async def create(self, data: AreaCreate) -> AreaRead:
        if await self._areas.name_exists(data.name):
            raise ConflictError(ErrorCode.AREA_NAME_TAKEN)
        await self._validate_manager(data.manager_id)
        area = await self._areas.add(
            Area(name=data.name, description=data.description, manager_id=data.manager_id)
        )
        await self._session.commit()
        return await self._read(area.id)

    async def update(self, area_id: uuid.UUID, data: AreaUpdate) -> AreaRead:
        area = await self._require(area_id)
        fields = data.model_fields_set
        if data.name is not None and data.name != area.name:
            if await self._areas.name_exists(data.name, exclude_id=area.id):
                raise ConflictError(ErrorCode.AREA_NAME_TAKEN)
            area.name = data.name
        if "description" in fields:
            area.description = data.description
        if "manager_id" in fields:
            await self._validate_manager(data.manager_id)
            area.manager_id = data.manager_id
        await self._session.commit()
        return await self._read(area.id)

    async def set_active(self, area_id: uuid.UUID, *, active: bool) -> AreaRead:
        area = await self._require(area_id)
        area.is_active = active
        await self._session.commit()
        return await self._read(area.id)

    async def _require(self, area_id: uuid.UUID) -> Area:
        area = await self._areas.get(area_id)
        if area is None:
            raise NotFoundError(ErrorCode.AREA_NOT_FOUND)
        return area

    async def _read(self, area_id: uuid.UUID) -> AreaRead:
        area = await self._areas.get_with_manager(area_id)
        if area is None:
            raise NotFoundError(ErrorCode.AREA_NOT_FOUND)
        return AreaRead.model_validate(area)

    async def _validate_manager(self, manager_id: uuid.UUID | None) -> None:
        if manager_id is None:
            return
        manager = await self._users.get(manager_id)
        if manager is None or not manager.is_active or manager.role not in MANAGER_ROLES:
            raise UnprocessableError(ErrorCode.AREA_INVALID_MANAGER)
