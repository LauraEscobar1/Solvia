from fastapi import APIRouter

from app.api.deps import AdminOnly, SlaPolicyServiceDep
from app.schemas.sla import SlaPolicyItem, SlaPolicyRead

router = APIRouter(prefix="/sla-policies", tags=["sla-policies"], dependencies=[AdminOnly])


@router.get("", summary="Matriz de políticas SLA por prioridad y etapa")
async def list_sla_policies(service: SlaPolicyServiceDep) -> list[SlaPolicyRead]:
    return await service.get_matrix()


@router.put("", summary="Reemplaza la matriz completa de políticas SLA")
async def replace_sla_policies(
    body: list[SlaPolicyItem], service: SlaPolicyServiceDep
) -> list[SlaPolicyRead]:
    return await service.replace_matrix(body)
