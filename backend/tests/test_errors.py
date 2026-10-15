import json
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import httpx2
import pytest
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel

from app.core.errors import AppError, ErrorCode, NotFoundError
from app.main import create_app
from tests.conftest import make_settings

LOCALES_DIR = Path(__file__).resolve().parents[2] / "desktop" / "src" / "locales"


class _Payload(BaseModel):
    title: str
    priority: int


def _build_app_with_failing_routes() -> FastAPI:
    app = create_app(make_settings())
    router = APIRouter(prefix="/_test")

    @router.get("/app-error")
    async def raise_app_error() -> None:
        raise AppError(ErrorCode.REQUEST_NOT_FOUND, status_code=404, params={"id": "42"})

    @router.get("/not-found")
    async def raise_not_found() -> None:
        raise NotFoundError()

    @router.post("/validate")
    async def validate(payload: _Payload) -> _Payload:
        return payload

    @router.get("/boom")
    async def boom() -> None:
        msg = "detalle interno que no debe filtrarse"
        raise RuntimeError(msg)

    app.include_router(router)
    return app


@pytest.fixture
async def error_client() -> AsyncIterator[httpx2.AsyncClient]:
    app = _build_app_with_failing_routes()
    async with app.router.lifespan_context(app):
        transport = httpx2.ASGITransport(app=app, raise_app_exceptions=False)
        async with httpx2.AsyncClient(transport=transport, base_url="http://test") as client:
            yield client


def _error(response: httpx2.Response) -> dict[str, Any]:
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "params"}
    error: dict[str, Any] = body["error"]
    return error


async def test_app_error_returns_code_and_params(error_client: httpx2.AsyncClient) -> None:
    response = await error_client.get("/_test/app-error")

    assert response.status_code == 404
    assert _error(response) == {"code": "request.not_found", "params": {"id": "42"}}


async def test_not_found_error_defaults_to_common_code(error_client: httpx2.AsyncClient) -> None:
    response = await error_client.get("/_test/not-found")

    assert response.status_code == 404
    assert _error(response)["code"] == "common.not_found"


async def test_unknown_route_returns_not_found_code(error_client: httpx2.AsyncClient) -> None:
    response = await error_client.get("/no-existe")

    assert response.status_code == 404
    assert _error(response) == {"code": "common.not_found", "params": {}}


async def test_method_not_allowed_returns_code(error_client: httpx2.AsyncClient) -> None:
    response = await error_client.delete("/api/v1/health")

    assert response.status_code == 405
    assert _error(response)["code"] == "common.method_not_allowed"


async def test_validation_error_lists_fields_without_messages(
    error_client: httpx2.AsyncClient,
) -> None:
    response = await error_client.post("/_test/validate", json={"priority": "alta"})

    assert response.status_code == 422
    error = _error(response)
    assert error["code"] == "common.validation_error"
    assert {"loc": "body.title", "type": "missing"} in error["params"]["fields"]
    assert {"loc": "body.priority", "type": "int_parsing"} in error["params"]["fields"]
    assert "alta" not in response.text


async def test_unexpected_error_hides_details(error_client: httpx2.AsyncClient) -> None:
    response = await error_client.get("/_test/boom")

    assert response.status_code == 500
    assert _error(response) == {"code": "common.internal_error", "params": {}}
    assert "detalle interno" not in response.text


def _flatten(tree: dict[str, Any], prefix: str = "") -> set[str]:
    keys: set[str] = set()
    for key, value in tree.items():
        path = f"{prefix}{key}"
        if isinstance(value, dict):
            keys |= _flatten(value, f"{path}.")
        else:
            keys.add(path)
    return keys


@pytest.mark.parametrize("language", ["es", "en"])
def test_every_error_code_has_a_frontend_translation(language: str) -> None:
    translations = json.loads((LOCALES_DIR / language / "errors.json").read_text("utf-8"))
    translated = _flatten(translations)

    missing = {code.value for code in ErrorCode} - translated
    assert not missing, f"Faltan traducciones en {language}/errors.json: {sorted(missing)}"
