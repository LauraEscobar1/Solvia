from collections.abc import Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta

from app.models.enums import (
    CLOSED_STATUSES,
    SLA_STAGES,
    RequestPriority,
    RequestStatus,
    SlaStatus,
)
from app.models.request import ServiceRequest
from app.models.sla_policy import SlaPolicy

AT_RISK_RATIO = 0.75


@dataclass(frozen=True, slots=True)
class SlaIndicators:
    status: SlaStatus | None
    is_stalled: bool


class SlaCatalog:
    def __init__(self, policies: Iterable[SlaPolicy]) -> None:
        self._policies = {(policy.priority, policy.status): policy for policy in policies}

    def total_hours(self, priority: RequestPriority) -> int | None:
        hours = [self._policies.get((priority, stage)) for stage in SLA_STAGES]
        if any(policy is None for policy in hours):
            return None
        return sum(policy.max_hours for policy in hours if policy is not None)

    def due_at(self, priority: RequestPriority, received_at: datetime) -> datetime | None:
        hours = self.total_hours(priority)
        return None if hours is None else received_at + timedelta(hours=hours)

    def inactivity_hours(self, priority: RequestPriority, status: RequestStatus) -> int | None:
        policy = self._policies.get((priority, status))
        return None if policy is None else policy.inactivity_hours

    def indicators(self, request: ServiceRequest, now: datetime) -> SlaIndicators:
        if request.status in CLOSED_STATUSES:
            return SlaIndicators(status=None, is_stalled=False)
        return SlaIndicators(
            status=self._due_status(request, now),
            is_stalled=self._is_stalled(request, now),
        )

    @staticmethod
    def _due_status(request: ServiceRequest, now: datetime) -> SlaStatus:
        if request.due_at is None:
            return SlaStatus.ON_TRACK
        if now >= request.due_at:
            return SlaStatus.OVERDUE
        window = (request.due_at - request.received_at).total_seconds()
        consumed = (now - request.received_at).total_seconds()
        if window > 0 and consumed / window > AT_RISK_RATIO:
            return SlaStatus.AT_RISK
        return SlaStatus.ON_TRACK

    def _is_stalled(self, request: ServiceRequest, now: datetime) -> bool:
        threshold = self.inactivity_hours(request.priority, request.status)
        if threshold is None:
            return False
        return now - request.last_activity_at > timedelta(hours=threshold)
