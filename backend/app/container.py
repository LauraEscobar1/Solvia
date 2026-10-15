from dataclasses import dataclass
from typing import Self

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from app.ai.base import AIProvider
from app.ai.factory import build_ai_provider
from app.core.config import Settings
from app.core.rate_limit import LoginRateLimiter
from app.db.session import create_engine, create_session_factory


@dataclass(frozen=True, slots=True)
class AppContainer:
    settings: Settings
    engine: AsyncEngine
    session_factory: async_sessionmaker[AsyncSession]
    ai_provider: AIProvider
    login_rate_limiter: LoginRateLimiter

    @classmethod
    def build(cls, settings: Settings) -> Self:
        engine = create_engine(settings)
        return cls(
            settings=settings,
            engine=engine,
            session_factory=create_session_factory(engine),
            ai_provider=build_ai_provider(settings),
            login_rate_limiter=LoginRateLimiter(
                settings.login_rate_limit_attempts,
                settings.login_rate_limit_window_seconds,
            ),
        )

    async def aclose(self) -> None:
        await self.ai_provider.aclose()
        await self.engine.dispose()
