import asyncio
import os
import uuid
from collections.abc import AsyncIterator
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import httpx2
import pytest
from alembic.config import Config
from fastapi import FastAPI
from pydantic import SecretStr
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from alembic import command
from app.core.config import Settings
from app.core.security import create_access_token, hash_password
from app.core.time import utcnow
from app.main import create_app
from app.models import Area, User
from app.models.enums import UserRole
from tests.conftest import make_settings

DEFAULT_TEST_DATABASE_URL = "postgresql+asyncpg://solvia:solvia@localhost:5433/solvia_test"
PASSWORD = "contrasena-de-prueba-123"
BACKEND_DIR = Path(__file__).resolve().parents[2]
TRUNCATE_ALL = (
    "TRUNCATE users, areas, requests, request_events, sla_policies, alerts, ai_insights, "
    "refresh_tokens RESTART IDENTITY CASCADE"
)


def _test_database_url() -> str:
    return os.environ.get("TEST_DATABASE_URL", DEFAULT_TEST_DATABASE_URL)


async def _can_connect(url: str) -> bool:
    engine = create_async_engine(url, connect_args={"timeout": 3})
    try:
        async with engine.connect() as connection:
            await connection.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001
        return False
    finally:
        await engine.dispose()
    return True


def _run_migrations(url: str) -> None:
    config = Config()
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.attributes["database_url"] = url
    command.downgrade(config, "base")
    command.upgrade(config, "head")


@pytest.fixture(scope="session")
def database_url() -> str:
    url = _test_database_url()
    if not asyncio.run(_can_connect(url)):
        message = (
            "Postgres de prueba no disponible. Inícialo con: "
            "docker compose --profile test up -d postgres-test"
        )
        if os.environ.get("REQUIRE_TEST_DB"):
            pytest.fail(message)
        pytest.skip(message)
    _run_migrations(url)
    return url


@lru_cache(maxsize=1)
def password_hash() -> str:
    return hash_password(PASSWORD)


@pytest.fixture
def db_settings(database_url: str) -> Settings:
    return make_settings(database_url=SecretStr(database_url))


@pytest.fixture
async def db_app(db_settings: Settings) -> AsyncIterator[FastAPI]:
    application = create_app(db_settings)
    async with application.router.lifespan_context(application):
        async with application.state.container.session_factory() as session:
            await session.execute(text(TRUNCATE_ALL))
            await session.execute(text("ALTER SEQUENCE request_code_seq RESTART WITH 1"))
            await session.commit()
        yield application


@pytest.fixture
async def db_client(db_app: FastAPI) -> AsyncIterator[httpx2.AsyncClient]:
    transport = httpx2.ASGITransport(app=db_app)
    async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
        yield client


@pytest.fixture
async def session(db_app: FastAPI) -> AsyncIterator[AsyncSession]:
    async with db_app.state.container.session_factory() as db_session:
        yield db_session


@dataclass
class Factory:
    session: AsyncSession
    settings: Settings

    async def area(self, name: str | None = None, *, is_active: bool = True) -> Area:
        area = Area(name=name or f"Área {uuid.uuid4().hex[:8]}", is_active=is_active)
        self.session.add(area)
        await self.session.commit()
        return area

    async def user(
        self,
        role: UserRole = UserRole.REQUESTER,
        *,
        area: Area | None = None,
        email: str | None = None,
        is_active: bool = True,
        must_change_password: bool = False,
    ) -> User:
        user = User(
            full_name=f"{role.value.title()} {uuid.uuid4().hex[:6]}",
            email=email or f"{role.value}-{uuid.uuid4().hex[:8]}@example.com",
            password_hash=password_hash(),
            role=role,
            area_id=area.id if area else None,
            is_active=is_active,
            must_change_password=must_change_password,
        )
        self.session.add(user)
        await self.session.commit()
        return user

    def auth_headers(self, user: User) -> dict[str, str]:
        token, _ = create_access_token(
            self.settings, user_id=user.id, role=user.role, area_id=user.area_id, now=utcnow()
        )
        return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def factory(session: AsyncSession, db_settings: Settings) -> Factory:
    return Factory(session, db_settings)


async def login(client: httpx2.AsyncClient, email: str, password: str = PASSWORD) -> dict[str, Any]:
    response = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def bearer(tokens: dict[str, Any]) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}
