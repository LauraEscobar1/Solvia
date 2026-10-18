import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import CurrentUserDep, RequestServiceDep
from app.schemas.common import Page
from app.schemas.request import (
    AssignInput,
    AssignmentSuggestionRead,
    CommentInput,
    DueEstimate,
    EventListQuery,
    RequestBoard,
    RequestCreate,
    RequestDetail,
    RequestEventRead,
    RequestFilters,
    RequestListQuery,
    RequestStages,
    RequestSummary,
    RequestUpdate,
    TransitionInput,
)

router = APIRouter(prefix="/requests", tags=["requests"])


@router.get("", summary="Lista paginada de solicitudes visibles para el usuario")
async def list_requests(
    query: Annotated[RequestListQuery, Query()], actor: CurrentUserDep, service: RequestServiceDep
) -> Page[RequestSummary]:
    return await service.search(actor, query)


@router.get("/board", summary="Solicitudes agrupadas por estado para el tablero")
async def board(
    filters: Annotated[RequestFilters, Query()], actor: CurrentUserDep, service: RequestServiceDep
) -> RequestBoard:
    return await service.board(actor, filters)


@router.get("/due-estimates", summary="Horas SLA totales por prioridad")
async def due_estimates(_actor: CurrentUserDep, service: RequestServiceDep) -> list[DueEstimate]:
    return await service.due_estimates()


@router.post("", status_code=status.HTTP_201_CREATED, summary="Crea una solicitud")
async def create_request(
    body: RequestCreate, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestDetail:
    return await service.create(actor, body)


@router.get("/{request_id}", summary="Detalle con transiciones y permisos del usuario")
async def get_request(
    request_id: uuid.UUID, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestDetail:
    return await service.get(actor, request_id)


@router.get("/{request_id}/stages", summary="Tiempo acumulado en cada etapa según el historial")
async def request_stages(
    request_id: uuid.UUID, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestStages:
    return await service.stages(actor, request_id)


@router.get(
    "/{request_id}/assignment-suggestion",
    summary="Responsable del área con menos solicitudes abiertas para reasignar",
)
async def assignment_suggestion(
    request_id: uuid.UUID, actor: CurrentUserDep, service: RequestServiceDep
) -> AssignmentSuggestionRead:
    return await service.assignment_suggestion(actor, request_id)


@router.patch("/{request_id}", summary="Edita título, descripción, prioridad o fecha límite")
async def update_request(
    request_id: uuid.UUID, body: RequestUpdate, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestDetail:
    return await service.update(actor, request_id, body)


@router.post("/{request_id}/transition", summary="Cambia el estado de la solicitud")
async def transition_request(
    request_id: uuid.UUID, body: TransitionInput, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestDetail:
    return await service.transition(actor, request_id, body)


@router.post("/{request_id}/assign", summary="Asigna o reasigna el responsable")
async def assign_request(
    request_id: uuid.UUID, body: AssignInput, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestDetail:
    return await service.assign(actor, request_id, body)


@router.post(
    "/{request_id}/comments",
    status_code=status.HTTP_201_CREATED,
    summary="Añade un comentario",
)
async def comment_request(
    request_id: uuid.UUID, body: CommentInput, actor: CurrentUserDep, service: RequestServiceDep
) -> RequestEventRead:
    return await service.comment(actor, request_id, body)


@router.get(
    "/{request_id}/events", summary="Historial de la solicitud, del más reciente al más antiguo"
)
async def list_request_events(
    request_id: uuid.UUID,
    query: Annotated[EventListQuery, Query()],
    actor: CurrentUserDep,
    service: RequestServiceDep,
) -> Page[RequestEventRead]:
    return await service.events(actor, request_id, query)
