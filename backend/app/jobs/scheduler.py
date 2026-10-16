from datetime import UTC, datetime
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from app.jobs.ai import AIJobs
from app.jobs.alerts import AlertJob

ALERTS_JOB_ID = "alerts-evaluation"
AI_DAILY_JOB_ID = "ai-daily-overview"
AI_DAILY_HOUR = 6


def start_scheduler(
    alert_job: AlertJob,
    interval_minutes: int,
    *,
    ai_jobs: AIJobs | None,
    timezone: ZoneInfo,
) -> AsyncIOScheduler:
    async def cycle() -> None:
        await alert_job.run()
        if ai_jobs is not None:
            await ai_jobs.run_automatic()

    scheduler = AsyncIOScheduler(timezone=UTC)
    scheduler.add_job(
        cycle,
        IntervalTrigger(minutes=interval_minutes),
        id=ALERTS_JOB_ID,
        max_instances=1,
        coalesce=True,
        next_run_time=datetime.now(UTC),
    )
    if ai_jobs is not None:
        scheduler.add_job(
            ai_jobs.run_daily,
            CronTrigger(hour=AI_DAILY_HOUR, minute=0, timezone=timezone),
            id=AI_DAILY_JOB_ID,
            max_instances=1,
            coalesce=True,
        )
    scheduler.start()
    return scheduler
