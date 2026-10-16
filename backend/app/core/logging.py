import logging
import re
import sys
from typing import Any

import structlog
from pydantic import SecretStr
from structlog.types import EventDict, Processor, WrappedLogger

from app.core.config import Settings

REDACTED = "***"

_SENSITIVE_KEY_MARKERS = (
    "password",
    "secret",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "access_token",
    "refresh_token",
    "database_url",
)

_SECRET_PATTERNS = (
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._~+/=\-]+"),
    re.compile(r"(?<=://)[^/\s:@]+:[^/\s@]+(?=@)"),
)

_NOISY_LOGGERS = ("openai", "httpx", "httpx2", "httpcore", "asyncio", "apscheduler")


def _is_sensitive_key(key: str) -> bool:
    lowered = key.lower()
    return any(marker in lowered for marker in _SENSITIVE_KEY_MARKERS)


def _scrub(value: Any) -> Any:
    if isinstance(value, SecretStr):
        return REDACTED
    if isinstance(value, str):
        for pattern in _SECRET_PATTERNS:
            value = pattern.sub(REDACTED, value)
        return value
    if isinstance(value, dict):
        return {
            k: REDACTED if isinstance(k, str) and _is_sensitive_key(k) else _scrub(v)
            for k, v in value.items()
        }
    if isinstance(value, list | tuple):
        return type(value)(_scrub(item) for item in value)
    return value


def _drop_color_message(
    _logger: WrappedLogger, _method_name: str, event_dict: EventDict
) -> EventDict:
    event_dict.pop("color_message", None)
    return event_dict


def redact_secrets(_logger: WrappedLogger, _method_name: str, event_dict: EventDict) -> EventDict:
    for key, value in event_dict.items():
        event_dict[key] = REDACTED if _is_sensitive_key(key) else _scrub(value)
    return event_dict


def configure_logging(settings: Settings) -> None:
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.ExtraAdder(),
        _drop_color_message,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]

    final_processors: list[Processor]
    if settings.is_production:
        final_processors = [
            structlog.processors.dict_tracebacks,
            redact_secrets,
            structlog.processors.JSONRenderer(),
        ]
    else:
        final_processors = [
            redact_secrets,
            structlog.dev.ConsoleRenderer(colors=sys.stdout.isatty()),
        ]

    structlog.configure(
        processors=[*shared_processors, structlog.stdlib.ProcessorFormatter.wrap_for_formatter],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[structlog.stdlib.ProcessorFormatter.remove_processors_meta, *final_processors],
    )
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(settings.log_level)

    for name in ("uvicorn", "uvicorn.error"):
        uvicorn_logger = logging.getLogger(name)
        uvicorn_logger.handlers.clear()
        uvicorn_logger.propagate = True
    access_logger = logging.getLogger("uvicorn.access")
    access_logger.handlers.clear()
    access_logger.propagate = False

    for name in _NOISY_LOGGERS:
        logging.getLogger(name).setLevel(max(logging.WARNING, root.level))
