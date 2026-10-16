import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import (
    BigInteger,
    ColumnElement,
    DateTime,
    Select,
    Uuid,
    delete,
    func,
    insert,
    literal,
    null,
    select,
    union_all,
)
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.risk_model import BASELINE_MIN_SAMPLES, BASELINE_PERCENTILE
from app.models.enums import SLA_STAGES, RequestPriority, RequestStatus
from app.models.request import ServiceRequest
from app.models.risk_baseline import RiskBaseline
from app.repositories.risk_rules import RiskRules
from app.repositories.sla_rules import elapsed_hours
from app.repositories.stage_history import stage_visits

BASELINE_LOCK_KEY = 5_100_216_302


@dataclass(frozen=True, slots=True)
class RiskRow:
    request_id: uuid.UUID
    code: str
    area_id: uuid.UUID
    priority: RequestPriority
    status: RequestStatus
    score: int
    hours_in_stage: float
    reference_hours: float | None
    reference_kind: str | None
    consumed_ratio: float | None
    idle_hours: float
    inactivity_threshold: int | None
    has_assignee: bool
    open_assigned: int
    stage_delay: float
    sla_consumed: float
    inactivity: float
    priority_factor: float
    assignee_load: float


class RiskRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def try_baseline_lock(self) -> bool:
        locked = await self._session.scalar(
            select(func.pg_try_advisory_xact_lock(literal(BASELINE_LOCK_KEY, BigInteger)))
        )
        return bool(locked)

    async def replace_baselines(self, now: datetime, window_days: int) -> int:
        since = now - timedelta(days=window_days)
        visits = stage_visits(ServiceRequest.last_activity_at >= since).subquery("visits")
        durations = (
            select(
                visits.c.area_id,
                visits.c.status,
                visits.c.priority,
                elapsed_hours(visits.c.entered_at, visits.c.left_at).label("hours"),
            )
            .where(
                visits.c.left_at.is_not(None),
                visits.c.left_at >= since,
                visits.c.status.in_(SLA_STAGES),
            )
            .cte("durations")
        )
        computed_at = literal(now, DateTime(timezone=True))

        def grouped(*, by_area: bool) -> Select[Any, Any, Any, Any, Any, Any]:
            area = durations.c.area_id if by_area else null().cast(Uuid())
            keys = [durations.c.status, durations.c.priority]
            return (
                select(
                    area,
                    durations.c.status,
                    durations.c.priority,
                    func.percentile_cont(BASELINE_PERCENTILE).within_group(durations.c.hours),
                    func.count(),
                    computed_at,
                )
                .group_by(*([durations.c.area_id] if by_area else []), *keys)
                .having(func.count() >= BASELINE_MIN_SAMPLES)
            )

        await self._session.execute(delete(RiskBaseline))
        rows = await self._session.execute(
            insert(RiskBaseline)
            .from_select(
                ["area_id", "status", "priority", "p90_hours", "sample_size", "computed_at"],
                union_all(grouped(by_area=True), grouped(by_area=False)),
                include_defaults=False,
            )
            .returning(RiskBaseline.id)
        )
        return len(rows.all())

    async def risk_rows(
        self,
        rules: RiskRules,
        *conditions: ColumnElement[bool],
        min_score: int | None = None,
        limit: int | None = None,
    ) -> list[RiskRow]:
        sla = rules.sla
        statement = select(
            ServiceRequest.id.label("request_id"),
            ServiceRequest.code,
            ServiceRequest.area_id,
            ServiceRequest.priority,
            ServiceRequest.status,
            rules.score.label("score"),
            rules.hours_in_stage.label("hours_in_stage"),
            rules.reference_hours.label("reference_hours"),
            rules.reference_kind.label("reference_kind"),
            sla.consumed_ratio.label("consumed_ratio"),
            sla.idle_hours.label("idle_hours"),
            sla.inactivity_threshold.label("inactivity_threshold"),
            ServiceRequest.assignee_id.is_not(None).label("has_assignee"),
            rules.open_assigned.label("open_assigned"),
            rules.stage_delay.label("stage_delay"),
            rules.sla_consumed.label("sla_consumed"),
            rules.inactivity.label("inactivity"),
            rules.priority.label("priority_factor"),
            rules.assignee_load.label("assignee_load"),
        ).where(sla.is_open, *conditions)
        if min_score is not None:
            statement = statement.where(rules.score >= min_score)
        statement = statement.order_by(rules.score.desc(), ServiceRequest.id)
        if limit is not None:
            statement = statement.limit(limit)
        rows = await self._session.execute(statement)
        return [RiskRow(**row._asdict()) for row in rows]

    async def risk_for(self, rules: RiskRules, request_ids: Sequence[uuid.UUID]) -> list[RiskRow]:
        if not request_ids:
            return []
        return await self.risk_rows(rules, ServiceRequest.id.in_(request_ids))
