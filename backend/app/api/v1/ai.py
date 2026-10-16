import uuid
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.api.deps import AdminDep, AIInsightServiceDep, CurrentUserDep
from app.schemas.ai import (
    AIStatusRead,
    FeedbackInput,
    LanguageQuery,
    OverviewQuery,
    OverviewRead,
    RequestAnalysisRead,
)

router = APIRouter(prefix="/ai", tags=["ai"])


@router.post(
    "/requests/{request_id}/analyze",
    summary="Analiza una solicitud con IA (o con reglas si la IA no está disponible)",
)
async def analyze_request(
    request_id: uuid.UUID,
    query: Annotated[LanguageQuery, Query()],
    actor: CurrentUserDep,
    service: AIInsightServiceDep,
) -> RequestAnalysisRead:
    return await service.analyze_request(actor, request_id, query.language)


@router.get(
    "/requests/{request_id}/insight",
    summary="Riesgo actual y último análisis guardado de una solicitud",
)
async def request_insight(
    request_id: uuid.UUID,
    query: Annotated[LanguageQuery, Query()],
    actor: CurrentUserDep,
    service: AIInsightServiceDep,
) -> RequestAnalysisRead:
    return await service.request_insight(actor, request_id, query.language)


@router.post("/overview/analyze", summary="Analiza la organización o un área con IA")
async def analyze_overview(
    query: Annotated[OverviewQuery, Query()],
    actor: CurrentUserDep,
    service: AIInsightServiceDep,
) -> OverviewRead:
    return await service.analyze_overview(actor, query.area_id, query.language)


@router.get("/overview", summary="Último análisis global o de un área")
async def overview(
    query: Annotated[OverviewQuery, Query()],
    actor: CurrentUserDep,
    service: AIInsightServiceDep,
) -> OverviewRead:
    return await service.overview(actor, query.area_id, query.language)


@router.get("/status", summary="Estado de la IA, modelos y consumo del día (solo admin)")
async def ai_status(_admin: AdminDep, service: AIInsightServiceDep) -> AIStatusRead:
    return await service.status()


@router.post(
    "/insights/{insight_id}/feedback",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Marca una recomendación como útil o no útil",
)
async def feedback(
    insight_id: uuid.UUID,
    body: FeedbackInput,
    actor: CurrentUserDep,
    service: AIInsightServiceDep,
) -> None:
    await service.feedback(actor, insight_id, item=body.item, useful=body.useful)
