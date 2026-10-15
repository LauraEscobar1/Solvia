from fastapi import APIRouter

from app.api.deps import HealthServiceDep
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", summary="Estado de la API, la base de datos y el proveedor de IA")
async def get_health(service: HealthServiceDep) -> HealthResponse:
    return await service.check()
