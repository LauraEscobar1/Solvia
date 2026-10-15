import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import AdminDep, AdminOnly, CurrentUserDep, SupervisorOrAdminDep, UserServiceDep
from app.schemas.common import Page
from app.schemas.user import UserCreate, UserListQuery, UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", summary="Lista paginada de usuarios (admin: todos; supervisor: su área)")
async def list_users(
    query: Annotated[UserListQuery, Query()],
    actor: SupervisorOrAdminDep,
    service: UserServiceDep,
) -> Page[UserRead]:
    return await service.search(actor, query)


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    dependencies=[AdminOnly],
    summary="Crea un usuario con contraseña temporal",
)
async def create_user(body: UserCreate, service: UserServiceDep) -> UserRead:
    return await service.create(body)


@router.get("/{user_id}", summary="Detalle de un usuario")
async def get_user(user_id: uuid.UUID, actor: CurrentUserDep, service: UserServiceDep) -> UserRead:
    return await service.get(actor, user_id)


@router.patch("/{user_id}", dependencies=[AdminOnly], summary="Actualiza un usuario")
async def update_user(user_id: uuid.UUID, body: UserUpdate, service: UserServiceDep) -> UserRead:
    return await service.update(user_id, body)


@router.post("/{user_id}/deactivate", summary="Desactiva un usuario")
async def deactivate_user(user_id: uuid.UUID, actor: AdminDep, service: UserServiceDep) -> UserRead:
    return await service.set_active(actor, user_id, active=False)


@router.post("/{user_id}/activate", summary="Reactiva un usuario")
async def activate_user(user_id: uuid.UUID, actor: AdminDep, service: UserServiceDep) -> UserRead:
    return await service.set_active(actor, user_id, active=True)
