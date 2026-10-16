import time
import uuid
from collections.abc import Iterable, Sequence
from dataclasses import asdict, dataclass
from datetime import datetime
from typing import Any

import structlog
from pydantic import JsonValue
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.time import Clock, utcnow
from app.models.alert import Alert
from app.models.enums import AlertSeverity, AlertSource, AlertType, RequestPriority
from app.repositories.alert import AlertRepository
from app.repositories.request import RequestRepository, RequestSlaState
from app.repositories.sla_rules import SlaRules

logger = structlog.get_logger(__name__)

URGENT_PRIORITIES = frozenset({RequestPriority.HIGH, RequestPriority.CRITICAL})

type AlertKey = tuple[AlertType, uuid.UUID, str | None]


def message_code(alert_type: AlertType) -> str:
    return f"alert.{alert_type.value}"


def alert_key(
    alert_type: AlertType,
    request_id: uuid.UUID | None,
    area_id: uuid.UUID,
    params: dict[str, Any],
) -> AlertKey:
    if request_id is not None:
        return (alert_type, request_id, None)
    return (alert_type, area_id, str(params.get("status")))


@dataclass(frozen=True, slots=True)
class AlertDraft:
    type: AlertType
    severity: AlertSeverity
    area_id: uuid.UUID
    request_id: uuid.UUID | None
    params: dict[str, JsonValue]

    @property
    def key(self) -> AlertKey:
        return alert_key(self.type, self.request_id, self.area_id, self.params)


@dataclass(slots=True)
class EvaluationReport:
    created: int = 0
    updated: int = 0
    resolved: int = 0
    bottlenecks: int = 0
    skipped: bool = False
    duration_ms: int = 0


def request_alert_drafts(state: RequestSlaState) -> list[AlertDraft]:
    drafts: list[AlertDraft] = []

    def draft(alert_type: AlertType, severity: AlertSeverity, **params: JsonValue) -> None:
        values: dict[str, JsonValue] = {"code": state.code, **params}
        drafts.append(AlertDraft(alert_type, severity, state.area_id, state.id, values))

    due_at = state.due_at.isoformat() if state.due_at else None
    if state.is_overdue:
        draft(AlertType.OVERDUE, AlertSeverity.CRITICAL, due_at=due_at)
    elif state.is_due_soon:
        draft(AlertType.DUE_SOON, AlertSeverity.WARNING, due_at=due_at)
    if state.is_stalled:
        urgent = state.priority in URGENT_PRIORITIES
        draft(
            AlertType.STALLED,
            AlertSeverity.CRITICAL if urgent else AlertSeverity.WARNING,
            status=state.status.value,
            idle_since=state.last_activity_at.isoformat(),
            threshold_hours=state.inactivity_threshold,
        )
    return drafts


class AlertEvaluator:
    def __init__(self, session: AsyncSession, clock: Clock = utcnow) -> None:
        self._session = session
        self._clock = clock
        self._alerts = AlertRepository(session)
        self._requests = RequestRepository(session)

    async def evaluate_all(self) -> EvaluationReport:
        started = time.perf_counter()
        report = EvaluationReport()
        now = self._clock()
        states = await self._requests.sla_states(SlaRules(now))
        drafts = [draft for state in states for draft in request_alert_drafts(state)]
        existing = await self._alerts.open_for_requests([state.id for state in states])
        await self._apply(report, drafts, existing, now)
        await self._session.commit()
        report.duration_ms = round((time.perf_counter() - started) * 1000)
        logger.info("alerts_evaluated", **asdict(report))
        return report

    async def evaluate_request(self, request_id: uuid.UUID) -> EvaluationReport:
        report = EvaluationReport()
        now = self._clock()
        states = await self._requests.sla_states(SlaRules(now), request_id=request_id)
        drafts = [draft for state in states for draft in request_alert_drafts(state)]
        existing = await self._alerts.open_for_request(request_id)
        await self._apply(report, drafts, existing, now)
        return report

    async def _apply(
        self,
        report: EvaluationReport,
        drafts: Sequence[AlertDraft],
        existing: Iterable[Alert],
        now: datetime,
    ) -> None:
        current = {
            alert_key(alert.type, alert.request_id, alert.area_id, alert.params): alert
            for alert in existing
        }
        pending: list[dict[str, Any]] = []
        for draft in drafts:
            alert = current.pop(draft.key, None)
            if alert is None:
                pending.append(
                    {
                        "type": draft.type,
                        "severity": draft.severity,
                        "source": AlertSource.RULE,
                        "area_id": draft.area_id,
                        "request_id": draft.request_id,
                        "message_code": message_code(draft.type),
                        "params": draft.params,
                        "created_at": now,
                    }
                )
            elif alert.severity is not draft.severity or alert.params != draft.params:
                alert.severity = draft.severity
                alert.params = dict(draft.params)
                report.updated += 1
        for alert in current.values():
            alert.resolved_at = now
            report.resolved += 1
        await self._session.flush()
        report.created += await self._alerts.create_many(pending)
