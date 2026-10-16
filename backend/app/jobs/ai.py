import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from dataclasses import asdict, dataclass

import structlog
from sqlalchemy import BigInteger, func, literal, select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.ai.base import AIProvider
from app.ai.risk_model import AUTOMATIC_ANALYSIS_THRESHOLD
from app.core.config import AIProviderName
from app.core.errors import AppError
from app.core.time import Clock, utcnow
from app.models.enums import InsightSource, InsightTrigger
from app.services.ai_insights import AIConfig, AIInsightService

logger = structlog.get_logger(__name__)

AUTOMATIC_LOCK_KEY = 5_100_216_303
DAILY_LOCK_KEY = 5_100_216_304


@dataclass(slots=True)
class AutomaticReport:
    candidates: int = 0
    analyzed: int = 0
    fallbacks: int = 0
    tokens_used: int = 0
    skipped: str | None = None
    duration_ms: int = 0


class AIJobs:
    def __init__(
        self,
        engine: AsyncEngine,
        session_factory: async_sessionmaker[AsyncSession],
        provider: AIProvider,
        config: AIConfig,
        clock: Clock = utcnow,
    ) -> None:
        self._engine = engine
        self._session_factory = session_factory
        self._provider = provider
        self._config = config
        self._clock = clock

    def _service(self, session: AsyncSession) -> AIInsightService:
        return AIInsightService(session, self._provider, self._config, self._clock)

    @asynccontextmanager
    async def _lock(self, key: int) -> AsyncIterator[bool]:
        async with self._engine.connect() as connection:
            locked = bool(
                await connection.scalar(select(func.pg_try_advisory_lock(literal(key, BigInteger))))
            )
            try:
                yield locked
            finally:
                if locked:
                    await connection.scalar(
                        select(func.pg_advisory_unlock(literal(key, BigInteger)))
                    )
                await connection.commit()

    def _disabled(self) -> str | None:
        if self._provider.name is AIProviderName.NONE:
            return "provider_none"
        if not self._config.automatic_enabled:
            return "automatic_disabled"
        return None

    async def run_automatic(self) -> AutomaticReport:
        started = time.perf_counter()
        report = AutomaticReport(skipped=self._disabled())
        if report.skipped is None:
            try:
                await self._analyze_candidates(report)
            except Exception:
                logger.exception("ai_automatic_failed")
                report.skipped = "error"
        report.duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info("ai_automatic_completed", **asdict(report))
        return report

    async def _analyze_candidates(self, report: AutomaticReport) -> None:
        async with self._lock(AUTOMATIC_LOCK_KEY) as locked:
            if not locked:
                report.skipped = "locked"
                return
            async with self._session_factory() as session:
                service = self._service(session)
                blocked = await service.blocked_reason()
                if blocked is not None:
                    report.skipped = blocked
                    return
                candidates = await service.automatic_candidates(AUTOMATIC_ANALYSIS_THRESHOLD)
                cells = await service.all_cells() if candidates else []
                await session.commit()
            report.candidates = len(candidates)
            for request_id in candidates:
                async with self._session_factory() as session:
                    try:
                        result = await self._service(session).analyze_request(
                            None,
                            request_id,
                            None,
                            trigger=InsightTrigger.AUTOMATIC,
                            cells=cells,
                        )
                    except AppError as exc:
                        logger.info(
                            "ai_automatic_request_skipped",
                            request_id=str(request_id),
                            code=exc.code,
                        )
                        continue
                insight = result.insight
                if insight is None:
                    continue
                report.analyzed += 1
                report.tokens_used += 0 if insight.cached else insight.tokens_used
                if insight.source is InsightSource.RULE:
                    report.fallbacks += 1

    async def run_daily(self) -> bool:
        started = time.perf_counter()
        skipped = self._disabled()
        source: InsightSource | None = None
        tokens = 0
        if skipped is None:
            try:
                async with self._lock(DAILY_LOCK_KEY) as locked:
                    if not locked:
                        skipped = "locked"
                    else:
                        async with self._session_factory() as session:
                            service = self._service(session)
                            if await service.ran_today(InsightTrigger.SCHEDULED):
                                skipped = "already_ran"
                            else:
                                result = await service.analyze_overview(
                                    None, None, None, trigger=InsightTrigger.SCHEDULED
                                )
                                if result.insight is not None:
                                    source = result.insight.source
                                    tokens = result.insight.tokens_used
            except Exception:
                logger.exception("ai_daily_failed")
                skipped = "error"
        logger.info(
            "ai_daily_completed",
            skipped=skipped,
            source=source,
            tokens_used=tokens,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        return source is not None
