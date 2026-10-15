import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import AdminOnly, AreaServiceDep, CurrentUserDep
from app.schemas.area import AreaCreate, AreaListQuery, AreaRead, AreaUpdate
from app.schemas.common import Page

router = APIRouter(prefix="/areas", tags=["areas"])


@router.get("", summary="Lista paginada de áreas")
async def list_areas(
    query: Annotated[AreaListQuery, Query()], actor: CurrentUserDep, service: AreaServiceDep
) -> Page[AreaRead]:
    return await service.search(actor, query)


@router.post(
    "", status_code=status.HTTP_201_CREATED, dependencies=[AdminOnly], summary="Crea un área"
)
async def create_area(body: AreaCreate, service: AreaServiceDep) -> AreaRead:
    return await service.create(body)


@router.get("/{area_id}", summary="Detalle de un área")
async def get_area(area_id: uuid.UUID, actor: CurrentUserDep, service: AreaServiceDep) -> AreaRead:
    return await service.get(actor, area_id)


@router.patch("/{area_id}", dependencies=[AdminOnly], summary="Actualiza un área")
async def update_area(area_id: uuid.UUID, body: AreaUpdate, service: AreaServiceDep) -> AreaRead:
    return await service.update(area_id, body)


@router.post("/{area_id}/deactivate", dependencies=[AdminOnly], summary="Desactiva un área")
async def deactivate_area(area_id: uuid.UUID, service: AreaServiceDep) -> AreaRead:
    return await service.set_active(area_id, active=False)


@router.post("/{area_id}/activate", dependencies=[AdminOnly], summary="Reactiva un área")
async def activate_area(area_id: uuid.UUID, service: AreaServiceDep) -> AreaRead:
    return await service.set_active(area_id, active=True)
