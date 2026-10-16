from fastapi import APIRouter

from app.api.deps import AdminDep, AlertServiceDep
from app.schemas.alert import AlertEvaluationRead

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.post("/evaluate", summary="Evalúa ahora las reglas de alertas (solo admin)")
async def evaluate_alerts(_admin: AdminDep, service: AlertServiceDep) -> AlertEvaluationRead:
    return await service.evaluate()
