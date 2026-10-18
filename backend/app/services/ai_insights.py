import hashlib
import json
import math
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import structlog
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.analytics import RiskAnalytics, RiskBreakdown
from app.ai.base import AIProvider, AIProviderError, AnalysisKind, Language, ProviderFailure
from app.ai.content import (
    overview_content_from_ai,
    overview_content_from_rules,
    request_content_from_ai,
    request_content_from_rules,
    scope_from,
)
from app.ai.payloads import (
    OverviewContext,
    RequestContext,
    StageContext,
    Totals,
    TrendWeek,
    overview_payload,
    request_payload,
    request_text,
)
from app.core.config import AIProviderName, Settings
from app.core.errors import (
    ConflictError,
    ErrorCode,
    ForbiddenError,
    NotFoundError,
    TooManyRequestsError,
    UnprocessableError,
)
from app.core.time import Clock, day_end, day_start, local_date, utcnow
from app.models.ai_insight import AIInsight
from app.models.enums import (
    InsightScope,
    InsightSource,
    InsightTrigger,
    UILanguage,
    UserRole,
)
from app.models.request import ServiceRequest
from app.models.user import User
from app.repositories.ai_context import AIContextRepository, RequestFacts
from app.repositories.ai_insight import AIInsightRepository
from app.repositories.dashboard import DashboardFilter, DashboardRepository
from app.repositories.request import RequestRepository, RequestScope
from app.repositories.sla_rules import SlaRules
from app.schemas.ai import (
    AIStatusRead,
    DailyRunRead,
    OverviewInsightContent,
    OverviewInsightRead,
    OverviewRead,
    RequestAnalysisRead,
    RequestInsightContent,
    RequestInsightRead,
    RiskFactorRead,
    RiskRead,
)
from app.services.alerts import AlertEvaluator
from app.services.bottlenecks import BottleneckCell, BottleneckDetector
from app.services.request_policy import Capability, RequestPolicy

logger = structlog.get_logger(__name__)

RATE_WINDOW = timedelta(hours=1)
RISK_BAND = 10
TREND_WEEKS = 4
SUMMARY_DAYS = 30
RECENT_COMPLETION_DAYS = 7
OVERVIEW_TOP_RISKS = 10
SYSTEM_SCOPE = RequestScope(
    everything=True, user_id=uuid.UUID(int=0), area_id=None, include_assigned=False
)


@dataclass(frozen=True, slots=True)
class AIConfig:
    timezone: ZoneInfo
    organization_language: UILanguage
    daily_token_budget: int
    user_hourly_limit: int
    cache_hours: int
    send_request_text: bool
    automatic_enabled: bool
    automatic_max_per_run: int
    bottleneck_min_count: int
    key_configured: bool

    @classmethod
    def from_settings(cls, settings: Settings) -> "AIConfig":
        return cls(
            timezone=settings.timezone,
            organization_language=settings.organization_language,
            daily_token_budget=settings.ai_daily_token_budget,
            user_hourly_limit=settings.ai_user_hourly_limit,
            cache_hours=settings.ai_cache_hours,
            send_request_text=settings.ai_send_request_text,
            automatic_enabled=settings.ai_automatic_enabled,
            automatic_max_per_run=settings.ai_automatic_max_per_run,
            bottleneck_min_count=settings.bottleneck_min_count,
            key_configured=settings.deepseek_api_key is not None,
        )


@dataclass(frozen=True, slots=True)
class _Outcome:
    source: InsightSource
    content: BaseModel
    risk_score: int | None
    model: str | None
    tokens_used: int
    fallback_reason: str | None


def fingerprint(values: dict[str, Any]) -> str:
    canonical = json.dumps(values, sort_keys=True, default=str, separators=(",", ":"))
    return hashlib.sha256(canonical.encode()).hexdigest()


def _failure_code(failure: ProviderFailure) -> ErrorCode:
    if failure is ProviderFailure.DISABLED:
        return ErrorCode.AI_DISABLED
    return ErrorCode.AI_UNAVAILABLE


def risk_read(risk: RiskBreakdown) -> RiskRead:
    return RiskRead(
        score=risk.score,
        factors=[
            RiskFactorRead(
                factor=item.factor,
                value=item.value,
                reference=item.reference,
                reference_kind=item.reference_kind,
                normalized=item.normalized,
                weight=item.weight,
                points=item.points,
            )
            for item in risk.factors
        ],
    )


def _week_total(per_day: dict[date, int], week: date) -> int:
    return sum(per_day.get(week + timedelta(days=offset), 0) for offset in range(7))


def _week_starts(end: date) -> list[date]:
    first = end - timedelta(days=TREND_WEEKS * 7 - 1)
    return [first + timedelta(days=7 * index) for index in range(TREND_WEEKS)]


class AIInsightService:
    def __init__(
        self,
        session: AsyncSession,
        provider: AIProvider,
        config: AIConfig,
        clock: Clock = utcnow,
    ) -> None:
        self._session = session
        self._provider = provider
        self._config = config
        self._clock = clock
        self._insights = AIInsightRepository(session)
        self._context = AIContextRepository(session)
        self._requests = RequestRepository(session)
        self._dashboard = DashboardRepository(session)
        self._analytics = RiskAnalytics(session, clock)

    async def request_insight(
        self, actor: User, request_id: uuid.UUID, language: UILanguage | None
    ) -> RequestAnalysisRead:
        await self._visible_request(actor, request_id)
        wanted = language or actor.language
        risk = await self._analytics.breakdown(request_id)
        insight = await self._insights.latest(
            InsightScope.REQUEST, request_id, language=wanted
        ) or await self._insights.latest(InsightScope.REQUEST, request_id)
        return RequestAnalysisRead(
            request_id=request_id,
            risk=risk_read(risk) if risk else None,
            insight=await self._request_read(insight, actor, cached=False) if insight else None,
            notice=await self._notice(),
        )

    async def analyze_request(
        self,
        actor: User | None,
        request_id: uuid.UUID,
        language: UILanguage | None,
        *,
        trigger: InsightTrigger = InsightTrigger.MANUAL,
        cells: Sequence[BottleneckCell] | None = None,
    ) -> RequestAnalysisRead:
        if actor is not None:
            await self._visible_request(actor, request_id)
        risk = await self._analytics.breakdown(request_id)
        facts = await self._context.request_facts(request_id)
        if facts is None:
            raise NotFoundError(ErrorCode.REQUEST_NOT_FOUND)
        if risk is None:
            raise ConflictError(ErrorCode.REQUEST_CLOSED)
        wanted = language or (actor.language if actor else self._config.organization_language)
        now = self._clock()
        stage = await self._stage(facts, cells)
        model = self._provider.model_for(AnalysisKind.REQUEST)
        input_hash = fingerprint(
            {
                "kind": AnalysisKind.REQUEST,
                "model": model,
                "send_text": self._config.send_request_text,
                "code": facts.code,
                "status": facts.status,
                "priority": facts.priority,
                "has_assignee": facts.has_assignee,
                "due_at": facts.due_at,
                "last_activity_at": facts.last_activity_at,
                "risk_band": risk.score // RISK_BAND,
                "bottleneck": stage.is_bottleneck if stage else None,
            }
        )
        cached = await self._insights.cached(input_hash, wanted, self._cache_since(now))
        if cached is not None:
            return RequestAnalysisRead(
                request_id=request_id,
                risk=risk_read(risk),
                insight=await self._request_read(cached, actor, cached=True),
                notice=None,
            )
        if trigger is InsightTrigger.MANUAL and actor is not None:
            await self._check_rate(actor, now)
        payload = request_payload(_request_context(facts), risk, stage, now)
        text = (
            request_text(facts.title, facts.description) if self._config.send_request_text else None
        )
        reason = await self._blocked_reason(now)
        await self._session.commit()
        outcome = await self._run_request(
            payload,
            wanted.value,
            text=text,
            trigger=trigger,
            reason=reason,
            risk=risk,
        )
        insight = await self._save(
            scope=InsightScope.REQUEST,
            ref_id=request_id,
            trigger=trigger,
            language=wanted,
            input_hash=input_hash,
            outcome=outcome,
            actor=actor,
            now=now,
        )
        return RequestAnalysisRead(
            request_id=request_id,
            risk=risk_read(risk),
            insight=await self._request_read(insight, actor, cached=False),
            notice=outcome.fallback_reason,
        )

    async def overview(
        self, actor: User, area_id: uuid.UUID | None, language: UILanguage | None
    ) -> OverviewRead:
        target = self._overview_target(actor, area_id)
        wanted = language or actor.language
        scope = InsightScope.AREA if target else InsightScope.GLOBAL
        insight = await self._insights.latest(scope, target, language=wanted)
        return OverviewRead(
            area_id=target,
            insight=await self._overview_read(insight, actor, cached=False) if insight else None,
            notice=await self._notice(),
        )

    async def analyze_overview(
        self,
        actor: User | None,
        area_id: uuid.UUID | None,
        language: UILanguage | None,
        *,
        trigger: InsightTrigger = InsightTrigger.MANUAL,
    ) -> OverviewRead:
        target = self._overview_target(actor, area_id) if actor is not None else area_id
        wanted = language or (actor.language if actor else self._config.organization_language)
        now = self._clock()
        context = await self._overview_context(target, now)
        model = self._provider.model_for(AnalysisKind.OVERVIEW)
        payload = overview_payload(context)
        input_hash = fingerprint({"kind": AnalysisKind.OVERVIEW, "model": model, **payload})
        scope = InsightScope.AREA if target else InsightScope.GLOBAL
        cached = await self._insights.cached(input_hash, wanted, self._cache_since(now))
        if cached is not None:
            return OverviewRead(
                area_id=target,
                insight=await self._overview_read(cached, actor, cached=True),
                notice=None,
            )
        if trigger is InsightTrigger.MANUAL and actor is not None:
            await self._check_rate(actor, now)
        reason = await self._blocked_reason(now)
        await self._session.commit()
        outcome = await self._run_overview(
            payload, wanted.value, trigger=trigger, reason=reason, context=context
        )
        insight = await self._save(
            scope=scope,
            ref_id=target,
            trigger=trigger,
            language=wanted,
            input_hash=input_hash,
            outcome=outcome,
            actor=actor,
            now=now,
        )
        return OverviewRead(
            area_id=target,
            insight=await self._overview_read(insight, actor, cached=False),
            notice=outcome.fallback_reason,
        )

    async def status(self) -> AIStatusRead:
        now = self._clock()
        used = await self._insights.tokens_since(self._today_start(now))
        last = await self._insights.latest(
            InsightScope.GLOBAL, None, trigger=InsightTrigger.SCHEDULED
        )
        return AIStatusRead(
            provider=self._provider.name,
            request_model=self._provider.model_for(AnalysisKind.REQUEST),
            overview_model=self._provider.model_for(AnalysisKind.OVERVIEW),
            key_configured=self._config.key_configured,
            automatic_enabled=self._config.automatic_enabled,
            send_request_text=self._config.send_request_text,
            tokens_used_today=used,
            daily_token_budget=self._config.daily_token_budget,
            budget_exceeded=used >= self._config.daily_token_budget,
            user_hourly_limit=self._config.user_hourly_limit,
            last_daily_run=(
                DailyRunRead(
                    created_at=last.created_at,
                    source=last.source,
                    fallback_reason=last.fallback_reason,
                    tokens_used=last.tokens_used,
                    model=last.model,
                )
                if last
                else None
            ),
        )

    async def feedback(
        self, actor: User, insight_id: uuid.UUID, *, item: int, useful: bool
    ) -> None:
        insight = await self._insights.get(insight_id)
        if insight is None:
            raise NotFoundError(ErrorCode.NOT_FOUND)
        if insight.scope is InsightScope.REQUEST and insight.ref_id is not None:
            await self._visible_request(actor, insight.ref_id)
            items = len(RequestInsightContent.model_validate(insight.content).actions)
        else:
            try:
                self._overview_target(actor, insight.ref_id)
            except ForbiddenError as exc:
                raise NotFoundError(ErrorCode.NOT_FOUND) from exc
            items = len(OverviewInsightContent.model_validate(insight.content).recommendations)
        if item >= items:
            raise UnprocessableError(
                ErrorCode.VALIDATION_ERROR,
                params={"fields": [{"loc": "body.item", "type": "out_of_range"}]},
            )
        await self._insights.save_feedback(
            insight_id, actor.id, item=item, useful=useful, now=self._clock()
        )
        await self._session.commit()

    async def automatic_candidates(self, threshold: int) -> list[uuid.UUID]:
        if not self._config.automatic_enabled or self._config.automatic_max_per_run == 0:
            return []
        now = self._clock()
        ranked = await self._analytics.ranked(min_score=threshold + 1)
        recent = await self._insights.analyzed_requests(
            [risk.request_id for risk in ranked], now - timedelta(hours=24)
        )
        candidates = [risk.request_id for risk in ranked if risk.request_id not in recent]
        return candidates[: self._config.automatic_max_per_run]

    async def all_cells(self) -> list[BottleneckCell]:
        detector = BottleneckDetector(
            self._session, min_count=self._config.bottleneck_min_count, clock=self._clock
        )
        return await detector.cells(self._config.timezone)

    async def _run_request(
        self,
        payload: dict[str, Any],
        language: Language,
        *,
        text: str | None,
        trigger: InsightTrigger,
        reason: str | None,
        risk: RiskBreakdown,
    ) -> _Outcome:
        tokens = 0
        if reason is None:
            try:
                completion = await self._provider.analyze_request(
                    payload,
                    language,
                    request_text=text,
                    retry_transient=trigger is not InsightTrigger.MANUAL,
                )
            except AIProviderError as exc:
                tokens = exc.tokens_used
                reason = _failure_code(exc.reason).value
                self._log_fallback(AnalysisKind.REQUEST, exc, trigger)
            else:
                content = request_content_from_ai(completion.result)
                return _Outcome(
                    source=InsightSource.AI,
                    content=content,
                    risk_score=completion.result.risk_score,
                    model=completion.model,
                    tokens_used=completion.tokens_used,
                    fallback_reason=None,
                )
        return _Outcome(
            source=InsightSource.RULE,
            content=request_content_from_rules(risk),
            risk_score=risk.score,
            model=None,
            tokens_used=tokens,
            fallback_reason=reason,
        )

    async def _run_overview(
        self,
        payload: dict[str, Any],
        language: Language,
        *,
        trigger: InsightTrigger,
        reason: str | None,
        context: OverviewContext,
    ) -> _Outcome:
        tokens = 0
        if reason is None:
            try:
                completion = await self._provider.analyze_overview(
                    payload, language, retry_transient=trigger is not InsightTrigger.MANUAL
                )
            except AIProviderError as exc:
                tokens = exc.tokens_used
                reason = _failure_code(exc.reason).value
                self._log_fallback(AnalysisKind.OVERVIEW, exc, trigger)
            else:
                scope = scope_from(
                    [(risk.code, risk.request_id) for risk in context.top_risks],
                    [area_id for area_id, _name in context.areas],
                )
                return _Outcome(
                    source=InsightSource.AI,
                    content=overview_content_from_ai(completion.result, scope),
                    risk_score=None,
                    model=completion.model,
                    tokens_used=completion.tokens_used,
                    fallback_reason=None,
                )
        return _Outcome(
            source=InsightSource.RULE,
            content=overview_content_from_rules(context),
            risk_score=None,
            model=None,
            tokens_used=tokens,
            fallback_reason=reason,
        )

    def _log_fallback(
        self, kind: AnalysisKind, exc: AIProviderError, trigger: InsightTrigger
    ) -> None:
        logger.warning(
            "ai_analysis_fallback",
            kind=kind,
            trigger=trigger,
            failure=exc.reason,
            tokens_used=exc.tokens_used,
        )

    async def _save(
        self,
        *,
        scope: InsightScope,
        ref_id: uuid.UUID | None,
        trigger: InsightTrigger,
        language: UILanguage,
        input_hash: str,
        outcome: _Outcome,
        actor: User | None,
        now: datetime,
    ) -> AIInsight:
        insight = await self._insights.add(
            AIInsight(
                scope=scope,
                ref_id=ref_id,
                source=outcome.source,
                trigger=trigger,
                language=language,
                input_hash=input_hash,
                risk_score=outcome.risk_score,
                content=outcome.content.model_dump(mode="json"),
                fallback_reason=outcome.fallback_reason,
                requested_by=actor.id if actor and trigger is InsightTrigger.MANUAL else None,
                provider=self._provider.name.value,
                model=outcome.model,
                tokens_used=outcome.tokens_used,
                created_at=now,
            )
        )
        await self._session.commit()
        if (
            scope is InsightScope.REQUEST
            and ref_id is not None
            and outcome.source is InsightSource.AI
        ):
            await self._reevaluate_alerts(ref_id)
        logger.info(
            "ai_insight_saved",
            scope=scope,
            trigger=trigger,
            source=outcome.source,
            tokens_used=outcome.tokens_used,
            fallback_reason=outcome.fallback_reason,
        )
        return insight

    async def _reevaluate_alerts(self, request_id: uuid.UUID) -> None:
        try:
            await AlertEvaluator(self._session, self._clock).evaluate_request(request_id)
            await self._session.commit()
        except Exception:
            await self._session.rollback()
            logger.exception("ai_alert_reevaluation_failed", request_id=str(request_id))

    async def blocked_reason(self) -> str | None:
        return await self._blocked_reason(self._clock())

    async def ran_today(self, trigger: InsightTrigger) -> bool:
        last = await self._insights.latest(InsightScope.GLOBAL, None, trigger=trigger)
        return last is not None and last.created_at >= self._today_start(self._clock())

    async def _blocked_reason(self, now: datetime) -> str | None:
        if self._provider.name is AIProviderName.NONE:
            return ErrorCode.AI_DISABLED.value
        used = await self._insights.tokens_since(self._today_start(now))
        if used >= self._config.daily_token_budget:
            return ErrorCode.AI_BUDGET_EXCEEDED.value
        return None

    async def _notice(self) -> str | None:
        return await self._blocked_reason(self._clock())

    async def _check_rate(self, actor: User, now: datetime) -> None:
        since = now - RATE_WINDOW
        count = await self._insights.manual_count(actor.id, since)
        if count >= self._config.user_hourly_limit:
            oldest = await self._insights.oldest_manual(actor.id, since)
            wait = (oldest + RATE_WINDOW - now).total_seconds() if oldest else RATE_WINDOW.seconds
            raise TooManyRequestsError(
                ErrorCode.AI_RATE_LIMITED, retry_after=max(1, math.ceil(wait))
            )

    async def _visible_request(self, actor: User, request_id: uuid.UUID) -> ServiceRequest:
        request = await self._requests.get(request_id)
        if request is None or not RequestPolicy(actor).can(Capability.VIEW, request):
            raise NotFoundError(ErrorCode.REQUEST_NOT_FOUND)
        return request

    @staticmethod
    def _overview_target(actor: User | None, area_id: uuid.UUID | None) -> uuid.UUID | None:
        if actor is None or actor.role is UserRole.ADMIN:
            return area_id
        if actor.role is UserRole.SUPERVISOR and actor.area_id is not None:
            if area_id is not None and area_id != actor.area_id:
                raise ForbiddenError
            return actor.area_id
        raise ForbiddenError

    async def _stage(
        self, facts: RequestFacts, cells: Sequence[BottleneckCell] | None
    ) -> StageContext | None:
        if cells is None:
            detector = BottleneckDetector(
                self._session, min_count=self._config.bottleneck_min_count, clock=self._clock
            )
            cells = await detector.cells(self._config.timezone, [facts.area_id])
        cell = next(
            (
                item
                for item in cells
                if item.area_id == facts.area_id and item.status is facts.status
            ),
            None,
        )
        if cell is None:
            return None
        return StageContext(
            open_in_stage=cell.count,
            median_open_30d=cell.median_count,
            is_bottleneck=cell.is_bottleneck,
        )

    async def _overview_context(self, area_id: uuid.UUID | None, now: datetime) -> OverviewContext:
        timezone = self._config.timezone
        today = local_date(now, timezone)
        target = DashboardFilter(scope=SYSTEM_SCOPE, area_id=area_id)
        rules = SlaRules(now)
        summary = await self._dashboard.summary(
            target,
            rules,
            completed_since=day_start(today - timedelta(days=RECENT_COMPLETION_DAYS - 1), timezone),
            start=day_start(today - timedelta(days=SUMMARY_DAYS - 1), timezone),
            end=day_end(today, timezone),
        )
        weeks = _week_starts(today)
        start, end = day_start(weeks[0], timezone), day_end(today, timezone)
        created = await self._dashboard.created_per_day(target, timezone.key, start=start, end=end)
        completed = await self._dashboard.completed_per_day(
            target, timezone.key, start=start, end=end
        )
        detector = BottleneckDetector(
            self._session, min_count=self._config.bottleneck_min_count, clock=self._clock
        )
        cells = await detector.cells(timezone, None if area_id is None else [area_id])
        conditions = [] if area_id is None else [ServiceRequest.area_id == area_id]
        top = await self._analytics.ranked(*conditions, limit=OVERVIEW_TOP_RISKS)
        areas = list({cell.area_id: cell.area_name for cell in cells}.items())
        return OverviewContext(
            area_id=area_id,
            day=today,
            timezone=timezone.key,
            areas=areas,
            totals=Totals(
                open=summary.open,
                due_soon=summary.due_soon,
                overdue=summary.overdue,
                stalled=summary.stalled,
                completed_last_7_days=summary.completed_recently,
                avg_resolution_hours=(
                    None
                    if summary.avg_resolution_hours is None
                    else round(summary.avg_resolution_hours, 1)
                ),
            ),
            cells=cells,
            trend_weeks=[
                TrendWeek(
                    week_start=week,
                    created=_week_total(created, week),
                    completed=_week_total(completed, week),
                )
                for week in weeks
            ],
            top_risks=top,
        )

    def _cache_since(self, now: datetime) -> datetime:
        return now - timedelta(hours=self._config.cache_hours)

    def _today_start(self, now: datetime) -> datetime:
        return day_start(local_date(now, self._config.timezone), self._config.timezone)

    async def _request_read(
        self, insight: AIInsight, actor: User | None, *, cached: bool
    ) -> RequestInsightRead:
        return RequestInsightRead(
            **self._meta(insight, cached),
            feedback=await self._feedback(insight, actor),
            content=RequestInsightContent.model_validate(insight.content),
        )

    async def _overview_read(
        self, insight: AIInsight, actor: User | None, *, cached: bool
    ) -> OverviewInsightRead:
        return OverviewInsightRead(
            **self._meta(insight, cached),
            area_id=insight.ref_id,
            feedback=await self._feedback(insight, actor),
            content=OverviewInsightContent.model_validate(insight.content),
        )

    async def _feedback(self, insight: AIInsight, actor: User | None) -> dict[int, bool]:
        if actor is None:
            return {}
        return await self._insights.feedback_for(insight.id, actor.id)

    @staticmethod
    def _meta(insight: AIInsight, cached: bool) -> dict[str, Any]:  # noqa: FBT001
        return {
            "id": insight.id,
            "source": insight.source,
            "trigger": insight.trigger,
            "language": insight.language,
            "provider": insight.provider,
            "model": insight.model,
            "tokens_used": insight.tokens_used,
            "fallback_reason": insight.fallback_reason,
            "cached": cached,
            "created_at": insight.created_at,
        }


def _request_context(facts: RequestFacts) -> RequestContext:
    return RequestContext(
        code=facts.code,
        area_name=facts.area_name,
        priority=facts.priority,
        status=facts.status,
        received_at=facts.received_at,
        due_at=facts.due_at,
        last_activity_at=facts.last_activity_at,
        has_assignee=facts.has_assignee,
        status_changes=facts.status_changes,
        returns=facts.returns,
        reassignments=facts.reassignments,
        comments=facts.comments,
    )
