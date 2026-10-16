import time
import uuid
from dataclasses import dataclass

import structlog
from sqlalchemy import ColumnElement
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.risk_model import BASELINE_WINDOW_DAYS, RISK_WEIGHTS, ReferenceKind, RiskFactor
from app.core.time import Clock, utcnow
from app.models.enums import RequestPriority, RequestStatus
from app.repositories.risk import RiskRepository, RiskRow
from app.repositories.risk_rules import RiskRules
from app.repositories.sla_rules import SlaRules

logger = structlog.get_logger(__name__)

UNASSIGNED = "unassigned"


@dataclass(frozen=True, slots=True)
class FactorContribution:
    factor: RiskFactor
    value: float | str | None
    reference: float | None
    reference_kind: ReferenceKind | None
    normalized: float
    weight: float
    points: float


@dataclass(frozen=True, slots=True)
class RiskBreakdown:
    request_id: uuid.UUID
    code: str
    area_id: uuid.UUID
    priority: RequestPriority
    status: RequestStatus
    score: int
    factors: tuple[FactorContribution, ...]

    def factor(self, factor: RiskFactor) -> FactorContribution:
        return next(item for item in self.factors if item.factor is factor)

    def top_factors(self, limit: int = 3) -> list[RiskFactor]:
        ranked = sorted(self.factors, key=lambda item: item.points, reverse=True)
        return [item.factor for item in ranked[:limit] if item.points > 0]


def _round(value: float | None, digits: int = 1) -> float | None:
    return None if value is None else round(value, digits)


def _contribution(
    factor: RiskFactor,
    normalized: float,
    *,
    value: float | str | None,
    reference: float | None = None,
    reference_kind: ReferenceKind | None = None,
) -> FactorContribution:
    weight = RISK_WEIGHTS[factor]
    return FactorContribution(
        factor=factor,
        value=value,
        reference=reference,
        reference_kind=reference_kind,
        normalized=round(normalized, 3),
        weight=weight,
        points=round(100 * weight * normalized, 1),
    )


def breakdown_from(row: RiskRow) -> RiskBreakdown:
    kind = ReferenceKind(row.reference_kind) if row.reference_kind else None
    threshold = float(row.inactivity_threshold) if row.inactivity_threshold is not None else None
    factors = (
        _contribution(
            RiskFactor.STAGE_DELAY,
            row.stage_delay,
            value=_round(row.hours_in_stage),
            reference=_round(row.reference_hours),
            reference_kind=kind,
        ),
        _contribution(
            RiskFactor.SLA_CONSUMED, row.sla_consumed, value=_round(row.consumed_ratio, 2)
        ),
        _contribution(
            RiskFactor.INACTIVITY,
            row.inactivity,
            value=_round(row.idle_hours),
            reference=threshold,
        ),
        _contribution(RiskFactor.PRIORITY, row.priority_factor, value=row.priority.value),
        _contribution(
            RiskFactor.ASSIGNEE_LOAD,
            row.assignee_load,
            value=float(row.open_assigned) if row.has_assignee else UNASSIGNED,
            reference=_round(row.reference_hours) if not row.has_assignee else None,
            reference_kind=kind if not row.has_assignee else None,
        ),
    )
    return RiskBreakdown(
        request_id=row.request_id,
        code=row.code,
        area_id=row.area_id,
        priority=row.priority,
        status=row.status,
        score=row.score,
        factors=factors,
    )


class RiskAnalytics:
    def __init__(self, session: AsyncSession, clock: Clock = utcnow) -> None:
        self._session = session
        self._clock = clock
        self._risk = RiskRepository(session)

    def rules(self) -> RiskRules:
        return RiskRules(SlaRules(self._clock()))

    async def refresh_baselines(self) -> int | None:
        started = time.perf_counter()
        if not await self._risk.try_baseline_lock():
            await self._session.rollback()
            logger.info("risk_baselines_skipped")
            return None
        rows = await self._risk.replace_baselines(self._clock(), BASELINE_WINDOW_DAYS)
        await self._session.commit()
        logger.info(
            "risk_baselines_refreshed",
            rows=rows,
            duration_ms=round((time.perf_counter() - started) * 1000),
        )
        return rows

    async def breakdown(self, request_id: uuid.UUID) -> RiskBreakdown | None:
        rows = await self._risk.risk_for(self.rules(), [request_id])
        return breakdown_from(rows[0]) if rows else None

    async def ranked(
        self,
        *conditions: ColumnElement[bool],
        min_score: int | None = None,
        limit: int | None = None,
    ) -> list[RiskBreakdown]:
        rows = await self._risk.risk_rows(
            self.rules(), *conditions, min_score=min_score, limit=limit
        )
        return [breakdown_from(row) for row in rows]
