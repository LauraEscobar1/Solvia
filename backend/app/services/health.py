from collections.abc import Awaitable, Callable

from app import __version__
from app.ai.base import AIProvider
from app.core.config import Settings
from app.schemas.health import (
    ComponentStatus,
    DatabaseHealth,
    HealthResponse,
    HealthStatus,
    OrganizationInfo,
)

DatabaseProbe = Callable[[], Awaitable[bool]]


class HealthService:
    def __init__(
        self, settings: Settings, database_probe: DatabaseProbe, ai_provider: AIProvider
    ) -> None:
        self._settings = settings
        self._database_probe = database_probe
        self._ai_provider = ai_provider

    async def check(self) -> HealthResponse:
        database_ok = await self._database_probe()
        return HealthResponse(
            status=HealthStatus.OK if database_ok else HealthStatus.DEGRADED,
            version=__version__,
            environment=self._settings.environment,
            database=DatabaseHealth(
                status=ComponentStatus.OK if database_ok else ComponentStatus.UNAVAILABLE
            ),
            ai=self._ai_provider.health(),
            organization=OrganizationInfo(name=self._settings.organization_name or None),
        )
