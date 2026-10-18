import httpx2
import pytest
from fastapi import FastAPI
from pydantic import SecretStr

from app import __version__
from app.ai.base import AIProvider
from app.ai.factory import build_ai_provider
from app.api.deps import get_ai_provider, get_database_probe
from app.core.config import AIProviderName
from app.core.middleware import REQUEST_ID_HEADER
from app.db.session import create_engine, ping_database
from app.main import create_app
from app.services.health import DatabaseProbe
from tests.conftest import make_settings

HEALTH_URL = "/api/v1/health"


def _probe_returning(*, ok: bool) -> DatabaseProbe:
    async def probe() -> bool:
        return ok

    return probe


async def test_health_ok_when_database_responds(app: FastAPI, client: httpx2.AsyncClient) -> None:
    app.dependency_overrides[get_database_probe] = lambda: _probe_returning(ok=True)

    response = await client.get(HEALTH_URL)

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "version": __version__,
        "environment": "test",
        "database": {"status": "ok"},
        "ai": {"provider": "none", "model": None, "configured": True},
        "organization": {"name": None},
    }


@pytest.mark.parametrize("name", ["  Universidad del Norte  ", "Universidad del Norte"])
async def test_health_exposes_the_organization_name(name: str) -> None:
    application = create_app(make_settings(organization_name=name))
    application.dependency_overrides[get_database_probe] = lambda: _probe_returning(ok=True)
    async with application.router.lifespan_context(application):
        transport = httpx2.ASGITransport(app=application)
        async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(HEALTH_URL)

    assert response.json()["organization"] == {"name": "Universidad del Norte"}


async def test_health_degraded_when_database_is_down(
    app: FastAPI, client: httpx2.AsyncClient
) -> None:
    app.dependency_overrides[get_database_probe] = lambda: _probe_returning(ok=False)

    response = await client.get(HEALTH_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "degraded"
    assert body["database"] == {"status": "unavailable"}


async def test_health_reports_deepseek_without_calling_it(
    app: FastAPI, client: httpx2.AsyncClient
) -> None:
    calls: list[httpx2.Request] = []

    def record(request: httpx2.Request) -> httpx2.Response:
        calls.append(request)
        return httpx2.Response(500)

    settings = make_settings(
        ai_provider=AIProviderName.DEEPSEEK, deepseek_api_key=SecretStr("sk-test-fake")
    )
    provider = build_ai_provider(
        settings, http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(record))
    )

    def override_provider() -> AIProvider:
        return provider

    app.dependency_overrides[get_database_probe] = lambda: _probe_returning(ok=True)
    app.dependency_overrides[get_ai_provider] = override_provider

    response = await client.get(HEALTH_URL)
    await provider.aclose()

    assert response.status_code == 200
    assert response.json()["ai"] == {
        "provider": "deepseek",
        "model": "deepseek-flash",
        "configured": True,
    }
    assert calls == []


async def test_responses_carry_request_id(app: FastAPI, client: httpx2.AsyncClient) -> None:
    app.dependency_overrides[get_database_probe] = lambda: _probe_returning(ok=True)

    generated = await client.get(HEALTH_URL)
    propagated = await client.get(HEALTH_URL, headers={REQUEST_ID_HEADER: "abc-123"})

    assert len(generated.headers[REQUEST_ID_HEADER]) == 32
    assert propagated.headers[REQUEST_ID_HEADER] == "abc-123"


async def test_ping_database_returns_false_when_unreachable() -> None:
    settings = make_settings(
        database_url=SecretStr("postgresql+asyncpg://u:p@127.0.0.1:1/db"),
        database_connect_timeout_seconds=2.0,
    )
    engine = create_engine(settings)
    try:
        assert await ping_database(engine, timeout_seconds=2.0) is False
    finally:
        await engine.dispose()
