from collections.abc import Callable
from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

Clock = Callable[[], datetime]


def utcnow() -> datetime:
    return datetime.now(UTC)


def local_date(moment: datetime, timezone: ZoneInfo) -> date:
    return moment.astimezone(timezone).date()


def day_start(day: date, timezone: ZoneInfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=timezone)


def day_end(day: date, timezone: ZoneInfo) -> datetime:
    return day_start(day + timedelta(days=1), timezone)
