from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import CurrentUserDep, DashboardServiceDep
from app.schemas.dashboard import (
    AreaBreakdown,
    BottleneckMatrix,
    DashboardQuery,
    DashboardSummary,
    RequestHighlights,
    StatusBreakdown,
    TrendSeries,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

QueryDep = Annotated[DashboardQuery, Query()]


@router.get("/summary", summary="Totales del panel: abiertas, SLA, completadas y resolución")
async def summary(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> DashboardSummary:
    return await service.summary(actor, query)


@router.get("/by-status", summary="Solicitudes recibidas en el rango por estado actual")
async def by_status(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> StatusBreakdown:
    return await service.by_status(actor, query)


@router.get("/at-risk", summary="Hasta 20 solicitudes vencidas o por vencer")
async def at_risk(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> RequestHighlights:
    return await service.at_risk(actor, query)


@router.get("/stalled", summary="Hasta 20 solicitudes sin movimiento, por horas de inactividad")
async def stalled(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> RequestHighlights:
    return await service.stalled(actor, query)


@router.get("/bottlenecks", summary="Matriz de áreas y etapas con cuellos de botella")
async def bottlenecks(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> BottleneckMatrix:
    return await service.bottlenecks(actor, query)


@router.get("/trends", summary="Creadas y completadas por día en la zona de la organización")
async def trends(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> TrendSeries:
    return await service.trends(actor, query)


@router.get("/by-area", summary="Abiertas, vencidas y resolución promedio por área")
async def by_area(
    query: QueryDep, actor: CurrentUserDep, service: DashboardServiceDep
) -> AreaBreakdown:
    return await service.by_area(actor, query)
