from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api.v1.router import api_router
from app.container import AppContainer
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging
from app.core.middleware import REQUEST_ID_HEADER, RequestContextMiddleware
from app.jobs.ai import AIJobs
from app.jobs.alerts import AlertJob
from app.jobs.scheduler import start_scheduler
from app.services.ai_insights import AIConfig

logger = structlog.get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        container = AppContainer.build(settings)
        app.state.container = container
        scheduler = None
        if settings.alerts_job_enabled:
            scheduler = start_scheduler(
                AlertJob(
                    container.session_factory,
                    settings.timezone,
                    bottleneck_min_count=settings.bottleneck_min_count,
                ),
                settings.alerts_job_interval_minutes,
                ai_jobs=AIJobs(
                    container.engine,
                    container.session_factory,
                    container.ai_provider,
                    AIConfig.from_settings(settings),
                ),
                timezone=settings.timezone,
            )
        logger.info(
            "app_started",
            version=__version__,
            environment=settings.environment,
            ai_provider=settings.ai_provider,
            alerts_job_enabled=settings.alerts_job_enabled,
            ai_automatic_enabled=settings.ai_automatic_enabled,
        )
        try:
            yield
        finally:
            if scheduler is not None:
                scheduler.shutdown(wait=False)
            await container.aclose()
            logger.info("app_stopped")

    app = FastAPI(
        title="Solvia API",
        version=__version__,
        lifespan=lifespan,
        docs_url=None if settings.is_production else "/docs",
        redoc_url=None,
        openapi_url=None if settings.is_production else "/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=[REQUEST_ID_HEADER],
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)
    app.include_router(api_router)
    return app
