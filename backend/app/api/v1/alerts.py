import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import AdminDep, AlertServiceDep, CurrentUserDep
from app.schemas.alert import AlertCount, AlertEvaluationRead, AlertListQuery, AlertRead
from app.schemas.common import Page

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", summary="Alertas visibles para el usuario, de la más reciente a la más antigua")
async def list_alerts(
    query: Annotated[AlertListQuery, Query()], actor: CurrentUserDep, service: AlertServiceDep
) -> Page[AlertRead]:
    return await service.search(actor, query)


@router.get("/unread-count", summary="Alertas abiertas que el usuario aún no ha leído")
async def unread_count(actor: CurrentUserDep, service: AlertServiceDep) -> AlertCount:
    return await service.unread_count(actor)


@router.post("/read-all", summary="Marca como leídas todas las alertas visibles")
async def read_all(actor: CurrentUserDep, service: AlertServiceDep) -> AlertCount:
    return await service.mark_all_read(actor)


@router.post("/evaluate", summary="Evalúa ahora las reglas de alertas (solo admin)")
async def evaluate_alerts(_admin: AdminDep, service: AlertServiceDep) -> AlertEvaluationRead:
    return await service.evaluate()


@router.patch("/{alert_id}/read", summary="Marca una alerta como leída para el usuario")
async def mark_read(
    alert_id: uuid.UUID, actor: CurrentUserDep, service: AlertServiceDep
) -> AlertRead:
    return await service.mark_read(actor, alert_id)
