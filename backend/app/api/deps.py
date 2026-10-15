from collections.abc import AsyncIterator, Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base import AIProvider
from app.container import AppContainer
from app.core.config import Settings
from app.core.errors import ForbiddenError, UnauthorizedError
from app.core.security import decode_access_token
from app.db.session import ping_database
from app.models.enums import UserRole
from app.models.user import User
from app.repositories.user import UserRepository
from app.services.auth import AuthService
from app.services.health import DatabaseProbe, HealthService


def get_container(request: Request) -> AppContainer:
    container = getattr(request.app.state, "container", None)
    if not isinstance(container, AppContainer):
        msg = "AppContainer no inicializado: la app debe arrancar con su lifespan"
        raise TypeError(msg)
    return container


ContainerDep = Annotated[AppContainer, Depends(get_container)]


def get_app_settings(container: ContainerDep) -> Settings:
    return container.settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]


def get_ai_provider(container: ContainerDep) -> AIProvider:
    return container.ai_provider


AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]


async def get_session(container: ContainerDep) -> AsyncIterator[AsyncSession]:
    async with container.session_factory() as session:
        yield session


SessionDep = Annotated[AsyncSession, Depends(get_session)]


def get_client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


ClientIPDep = Annotated[str, Depends(get_client_ip)]


_bearer_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer_scheme)],
    session: SessionDep,
    settings: SettingsDep,
) -> User:
    if credentials is None:
        raise UnauthorizedError
    claims = decode_access_token(settings, credentials.credentials)
    user = await UserRepository(session).get(claims.sub)
    if user is None or not user.is_active:
        raise UnauthorizedError
    return user


CurrentUserDep = Annotated[User, Depends(get_current_user)]


def require_roles(*roles: UserRole) -> Callable[[User], Awaitable[User]]:
    allowed = frozenset(roles)

    async def dependency(user: CurrentUserDep) -> User:
        if user.role not in allowed:
            raise ForbiddenError
        return user

    return dependency


AdminDep = Annotated[User, Depends(require_roles(UserRole.ADMIN))]


def get_auth_service(
    session: SessionDep, settings: SettingsDep, container: ContainerDep
) -> AuthService:
    return AuthService(session, settings, container.login_rate_limiter)


AuthServiceDep = Annotated[AuthService, Depends(get_auth_service)]


def get_database_probe(container: ContainerDep) -> DatabaseProbe:
    async def probe() -> bool:
        return await ping_database(
            container.engine, container.settings.database_connect_timeout_seconds
        )

    return probe


DatabaseProbeDep = Annotated[DatabaseProbe, Depends(get_database_probe)]


def get_health_service(
    settings: SettingsDep, database_probe: DatabaseProbeDep, ai_provider: AIProviderDep
) -> HealthService:
    return HealthService(settings, database_probe, ai_provider)


HealthServiceDep = Annotated[HealthService, Depends(get_health_service)]
