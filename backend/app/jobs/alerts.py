from zoneinfo import ZoneInfo

import structlog
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.ai.analytics import RiskAnalytics
from app.core.time import Clock, utcnow
from app.services.alerts import AlertEvaluator, EvaluationReport

logger = structlog.get_logger(__name__)


class AlertJob:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        timezone: ZoneInfo,
        *,
        bottleneck_min_count: int,
        clock: Clock = utcnow,
    ) -> None:
        self._session_factory = session_factory
        self._timezone = timezone
        self._bottleneck_min_count = bottleneck_min_count
        self._clock = clock

    async def run(self) -> EvaluationReport | None:
        try:
            async with self._session_factory() as session:
                await RiskAnalytics(session, self._clock).refresh_baselines()
        except Exception:
            logger.exception("risk_baselines_failed")
        try:
            async with self._session_factory() as session:
                return await AlertEvaluator(session, self._clock).evaluate_all(
                    self._timezone, bottleneck_min_count=self._bottleneck_min_count
                )
        except Exception:
            logger.exception("alerts_evaluation_failed")
            return None
