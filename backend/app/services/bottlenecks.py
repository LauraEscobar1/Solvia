import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import timedelta
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import Clock, day_start, local_date, utcnow
from app.models.enums import SLA_STAGES, AlertSeverity, BottleneckReason, RequestStatus
from app.repositories.bottleneck import BottleneckRepository, StageHistory, StageLoad

HISTORY_DAYS = 30
COUNT_FACTOR = 1.5


@dataclass(frozen=True, slots=True)
class BottleneckCell:
    area_id: uuid.UUID
    area_name: str
    status: RequestStatus
    count: int
    avg_hours: float | None
    median_count: float
    median_avg_hours: float | None
    sla_max_hours: float | None
    reasons: tuple[BottleneckReason, ...]

    @property
    def is_bottleneck(self) -> bool:
        return bool(self.reasons)

    @property
    def severity(self) -> AlertSeverity:
        both = len(self.reasons) == len(BottleneckReason)
        return AlertSeverity.CRITICAL if both else AlertSeverity.WARNING


def bottleneck_reasons(
    count: int,
    median_count: float,
    avg_hours: float | None,
    sla_max_hours: float | None,
) -> tuple[BottleneckReason, ...]:
    reasons: list[BottleneckReason] = []
    if count > COUNT_FACTOR * median_count:
        reasons.append(BottleneckReason.COUNT_ABOVE_MEDIAN)
    if avg_hours is not None and sla_max_hours is not None and avg_hours > sla_max_hours:
        reasons.append(BottleneckReason.AVG_ABOVE_SLA)
    return tuple(reasons)


class BottleneckDetector:
    def __init__(self, session: AsyncSession, clock: Clock = utcnow) -> None:
        self._clock = clock
        self._repository = BottleneckRepository(session)

    async def cells(
        self, timezone: ZoneInfo, area_ids: Sequence[uuid.UUID] | None = None
    ) -> list[BottleneckCell]:
        now = self._clock()
        today = local_date(now, timezone)
        snapshots = [
            day_start(today - timedelta(days=offset), timezone) for offset in range(HISTORY_DAYS)
        ]
        loads = {
            (load.area_id, load.status): load
            for load in await self._repository.current_load(now, area_ids)
        }
        history = {
            (item.area_id, item.status): item
            for item in await self._repository.history(snapshots, area_ids)
        }
        with_data = {area_id for area_id, _status in loads.keys() | history.keys()}
        return [
            self._cell(
                area.id,
                area.name,
                status,
                loads.get((area.id, status)),
                history.get((area.id, status)),
            )
            for area in await self._repository.areas(area_ids)
            if area.is_active or area.id in with_data
            for status in SLA_STAGES
        ]

    @staticmethod
    def _cell(
        area_id: uuid.UUID,
        area_name: str,
        status: RequestStatus,
        load: StageLoad | None,
        history: StageHistory | None,
    ) -> BottleneckCell:
        count = load.count if load else 0
        avg_hours = load.avg_hours if load else None
        sla_max_hours = load.sla_max_hours if load else None
        median_count = history.median_count if history else 0.0
        return BottleneckCell(
            area_id=area_id,
            area_name=area_name,
            status=status,
            count=count,
            avg_hours=avg_hours,
            median_count=median_count,
            median_avg_hours=history.median_avg_hours if history else None,
            sla_max_hours=sla_max_hours,
            reasons=bottleneck_reasons(count, median_count, avg_hours, sla_max_hours),
        )
