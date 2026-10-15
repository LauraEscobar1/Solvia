from typing import Any

from fastapi import APIRouter

from app.api.v1 import health
from app.schemas.errors import ErrorResponse

_ERROR_RESPONSES: dict[int | str, dict[str, Any]] = {
    "4XX": {"model": ErrorResponse, "description": "Error del cliente (código estable)"},
    "5XX": {"model": ErrorResponse, "description": "Error del servidor (código estable)"},
}

api_router = APIRouter(prefix="/api/v1", responses=_ERROR_RESPONSES)
api_router.include_router(health.router)
