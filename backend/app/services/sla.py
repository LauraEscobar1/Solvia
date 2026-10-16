from collections.abc import Iterable
from datetime import datetime, timedelta

from app.models.enums import SLA_STAGES, RequestPriority
from app.models.sla_policy import SlaPolicy


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
