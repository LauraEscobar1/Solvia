from collections.abc import AsyncIterator, Iterator
from dataclasses import replace
from datetime import UTC, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

import pytest
import time_machine
from fastapi import FastAPI
from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.deepseek_provider import DeepSeekProvider
from app.core.config import Settings
from app.jobs.ai import AIJobs
from app.jobs.alerts import AlertJob
from app.jobs.scheduler import AI_DAILY_JOB_ID, start_scheduler
from app.models import AIInsight, Alert
from app.models.enums import (
    AlertType,
    InsightScope,
    InsightSource,
    InsightTrigger,
    RequestPriority,
    UILanguage,
    UserRole,
)
from app.services.ai_insights import AIConfig
from tests.ai_support import ScriptedDeepSeek, overview_reply, request_reply, scripted_provider
from tests.db.conftest import Factory

NOW = datetime(2026, 10, 15, 15, 0, tzinfo=UTC)
HIGH_HOURS = (8, 24, 72)
TZ = ZoneInfo("America/Bogota")


@pytest.fixture
def frozen() -> Iterator[time_machine.Traveller]:
    with time_machine.travel(NOW, tick=False) as traveller:
        yield traveller


@pytest.fixture
def script() -> ScriptedDeepSeek:
    return ScriptedDeepSeek()


@pytest.fixture
async def provider(script: ScriptedDeepSeek) -> AsyncIterator[DeepSeekProvider]:
    provider = scripted_provider(script)
    yield provider
    await provider.aclose()


@pytest.fixture
async def risky_ids(factory: Factory, frozen: time_machine.Traveller) -> list[str]:
    area = await factory.area("Soporte")
    requester = await factory.user(UserRole.REQUESTER)
    await factory.sla_matrix({RequestPriority.HIGH: HIGH_HOURS})
    ids = []
    for hours in (30, 40, 50):
        received = NOW - timedelta(hours=hours)
        request = await factory.request(
            area=area,
            requester=requester,
            priority=RequestPriority.HIGH,
            received_at=received,
            due_at=received + timedelta(hours=sum(HIGH_HOURS)),
        )
        ids.append(str(request.id))
    await factory.request(
        area=area, requester=requester, priority=RequestPriority.HIGH, received_at=NOW
    )
    return ids


def _jobs(
    db_app: FastAPI, provider: DeepSeekProvider, settings: Settings, **overrides: Any
) -> AIJobs:
    container = db_app.state.container
    config = replace(AIConfig.from_settings(settings), **overrides)
    return AIJobs(container.engine, container.session_factory, provider, config)


async def _count(session: AsyncSession, *conditions: ColumnElement[bool]) -> int:
    total = await session.scalar(select(func.count()).select_from(AIInsight).where(*conditions))
    return total or 0


async def test_automatic_analyzes_high_risk_requests_once_per_day(
    db_app: FastAPI,
    session: AsyncSession,
    db_settings: Settings,
    provider: DeepSeekProvider,
    script: ScriptedDeepSeek,
    risky_ids: list[str],
    frozen: time_machine.Traveller,
) -> None:
    script.add(*(request_reply(85) for _ in range(6)))
    jobs = _jobs(db_app, provider, db_settings)

    first = await jobs.run_automatic()
    again = await jobs.run_automatic()
    frozen.shift(timedelta(hours=24, minutes=1))
    next_day = await jobs.run_automatic()

    assert (first.candidates, first.analyzed, first.fallbacks) == (3, 3, 0)
    assert first.tokens_used == 2400
    assert again.candidates == 0
    assert next_day.analyzed == 3
    assert await _count(session, AIInsight.trigger == InsightTrigger.AUTOMATIC) == 6
    ai_alerts = await session.scalar(
        select(func.count()).select_from(Alert).where(Alert.type == AlertType.AI_RISK)
    )
    assert ai_alerts == 3


async def test_automatic_respects_the_limit_per_run(
    db_app: FastAPI,
    db_settings: Settings,
    provider: DeepSeekProvider,
    script: ScriptedDeepSeek,
    risky_ids: list[str],
) -> None:
    script.add(*(request_reply(85) for _ in range(2)))

    report = await _jobs(db_app, provider, db_settings, automatic_max_per_run=2).run_automatic()

    assert report.analyzed == 2
    assert len(script.requests) == 2


@pytest.mark.parametrize(
    ("overrides", "skipped"),
    [
        ({"automatic_enabled": False}, "automatic_disabled"),
        ({"daily_token_budget": 0}, "ai.budget_exceeded"),
    ],
)
async def test_automatic_is_skipped_when_switched_off_or_out_of_budget(
    db_app: FastAPI,
    session: AsyncSession,
    db_settings: Settings,
    provider: DeepSeekProvider,
    script: ScriptedDeepSeek,
    risky_ids: list[str],
    overrides: dict[str, Any],
    skipped: str,
) -> None:
    report = await _jobs(db_app, provider, db_settings, **overrides).run_automatic()

    assert report.skipped == skipped
    assert script.requests == []
    assert await _count(session) == 0


async def test_daily_overview_runs_once_in_the_organization_language(
    db_app: FastAPI,
    session: AsyncSession,
    db_settings: Settings,
    provider: DeepSeekProvider,
    script: ScriptedDeepSeek,
    risky_ids: list[str],
) -> None:
    script.add(overview_reply(), overview_reply())
    jobs = _jobs(db_app, provider, db_settings, organization_language=UILanguage.EN)

    first = await jobs.run_daily()
    second = await jobs.run_daily()

    stored = await session.scalar(
        select(AIInsight).where(AIInsight.trigger == InsightTrigger.SCHEDULED)
    )
    assert (first, second) == (True, False)
    assert len(script.requests) == 1
    assert script.body()["model"] == "deepseek-v4-pro"
    assert "English" in script.body()["messages"][0]["content"]
    assert stored is not None
    assert stored.scope is InsightScope.GLOBAL
    assert stored.source is InsightSource.AI
    assert stored.language is UILanguage.EN
    assert stored.tokens_used == 3000


async def test_daily_overview_is_skipped_when_automatic_analyses_are_off(
    db_app: FastAPI,
    db_settings: Settings,
    provider: DeepSeekProvider,
    script: ScriptedDeepSeek,
) -> None:
    assert await _jobs(db_app, provider, db_settings, automatic_enabled=False).run_daily() is False
    assert script.requests == []


async def test_scheduler_runs_the_daily_overview_at_six_in_the_organization_timezone(
    db_app: FastAPI, db_settings: Settings, provider: DeepSeekProvider
) -> None:
    container = db_app.state.container
    alert_job = AlertJob(container.session_factory, TZ, bottleneck_min_count=3)
    scheduler = start_scheduler(
        alert_job, 15, ai_jobs=_jobs(db_app, provider, db_settings), timezone=TZ
    )
    try:
        daily = scheduler.get_job(AI_DAILY_JOB_ID)
        assert daily is not None
        upcoming = daily.trigger.get_next_fire_time(None, datetime(2026, 10, 15, 12, tzinfo=UTC))
        assert upcoming.astimezone(TZ).hour == 6
        assert upcoming.astimezone(UTC).hour == 11
    finally:
        scheduler.shutdown(wait=False)
