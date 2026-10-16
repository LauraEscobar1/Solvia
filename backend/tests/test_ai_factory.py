import json
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from app.ai.base import AIProviderError, AnalysisKind, ProviderFailure
from app.ai.deepseek_provider import MAX_ATTEMPTS, DeepSeekProvider
from app.ai.factory import build_ai_provider
from app.ai.null_provider import NullProvider
from app.ai.prompts import RETRY_INSTRUCTION
from app.core.config import AIProviderName
from tests.conftest import make_settings

FAKE_KEY = "sk-test-not-a-real-key"
PAYLOAD: dict[str, Any] = {"request": {"code": "SOL-0001", "status": "received"}}
VALID_REQUEST = json.dumps(
    {
        "risk_score": 82,
        "summary": "Lleva días sin responsable.",
        "causes": ["Sin responsable"],
        "actions": [{"title": "Asignar", "detail": "Asignar hoy a alguien del área."}],
    }
)
VALID_OVERVIEW = json.dumps({"summary": "Todo en orden.", "findings": [], "recommendations": []})


def _completion(content: str | None, total_tokens: int = 70) -> dict[str, Any]:
    return {
        "id": "chatcmpl-test",
        "object": "chat.completion",
        "created": 1_760_000_000,
        "model": "deepseek-flash",
        "choices": [
            {
                "index": 0,
                "finish_reason": "stop",
                "message": {"role": "assistant", "content": content},
            }
        ],
        "usage": {"prompt_tokens": 50, "completion_tokens": 20, "total_tokens": total_tokens},
    }


class FakeDeepSeek:
    def __init__(self, *responses: httpx2.Response) -> None:
        self._responses = list(responses)
        self.requests: list[httpx2.Request] = []

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        return self._responses.pop(0)

    def body(self, index: int) -> dict[str, Any]:
        body: dict[str, Any] = json.loads(self.requests[index].content)
        return body

    @staticmethod
    def reply(content: str | None, total_tokens: int = 70) -> httpx2.Response:
        return httpx2.Response(200, json=_completion(content, total_tokens))


def _deepseek_provider(handler: Callable[[httpx2.Request], httpx2.Response]) -> DeepSeekProvider:
    settings = make_settings(
        ai_provider=AIProviderName.DEEPSEEK, deepseek_api_key=SecretStr(FAKE_KEY)
    )
    provider = build_ai_provider(
        settings, http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
    )
    assert isinstance(provider, DeepSeekProvider)
    return provider


async def test_factory_returns_null_provider_by_default() -> None:
    provider = build_ai_provider(make_settings())

    assert isinstance(provider, NullProvider)
    assert provider.health().provider is AIProviderName.NONE
    assert provider.model_for(AnalysisKind.REQUEST) is None


async def test_null_provider_reports_ai_as_disabled() -> None:
    with pytest.raises(AIProviderError) as exc_info:
        await NullProvider().analyze_request(PAYLOAD, "es")

    assert exc_info.value.reason is ProviderFailure.DISABLED


async def test_factory_returns_deepseek_provider_when_configured() -> None:
    provider = _deepseek_provider(FakeDeepSeek())

    health = provider.health()
    assert health.provider is AIProviderName.DEEPSEEK
    assert health.model == "deepseek-flash"
    assert provider.model_for(AnalysisKind.OVERVIEW) == "deepseek-v4-pro"
    await provider.aclose()


async def test_request_analysis_uses_flash_without_reasoning_in_json_mode() -> None:
    fake = FakeDeepSeek(FakeDeepSeek.reply(VALID_REQUEST))
    provider = _deepseek_provider(fake)

    completion = await provider.analyze_request(PAYLOAD, "es")
    await provider.aclose()

    assert completion.result.risk_score == 82
    assert completion.result.actions[0].title == "Asignar"
    assert completion.model == "deepseek-flash"
    assert completion.tokens_used == 70
    request = fake.requests[0]
    assert str(request.url) == "https://api.deepseek.com/chat/completions"
    body = fake.body(0)
    assert body["model"] == "deepseek-flash"
    assert body["response_format"] == {"type": "json_object"}
    assert body["thinking"] == {"type": "disabled"}
    assert "json" in body["messages"][0]["content"].lower()
    assert "Spanish" in body["messages"][0]["content"]


async def test_overview_uses_deep_model_with_reasoning() -> None:
    fake = FakeDeepSeek(FakeDeepSeek.reply(VALID_OVERVIEW))
    provider = _deepseek_provider(fake)

    completion = await provider.analyze_overview({"scope": "global"}, "en")
    await provider.aclose()

    body = fake.body(0)
    assert completion.result.summary == "Todo en orden."
    assert body["model"] == "deepseek-v4-pro"
    assert body["thinking"] == {"type": "enabled"}
    assert body["reasoning_effort"] == "high"
    assert "temperature" not in body
    assert "English" in body["messages"][0]["content"]


async def test_invalid_response_is_retried_once_and_tokens_add_up() -> None:
    fake = FakeDeepSeek(
        FakeDeepSeek.reply("esto no es json", total_tokens=40),
        FakeDeepSeek.reply(VALID_REQUEST, total_tokens=90),
    )
    provider = _deepseek_provider(fake)

    completion = await provider.analyze_request(PAYLOAD, "en")
    await provider.aclose()

    assert completion.tokens_used == 130
    assert len(fake.requests) == 2
    assert fake.body(1)["messages"][-1] == {"role": "user", "content": RETRY_INSTRUCTION}


@pytest.mark.parametrize(
    "invalid_content",
    [
        None,
        "",
        '{"risk_score": 170, "summary": "fuera de rango"}',
        '{"summary": "sin puntaje"}',
    ],
)
async def test_second_invalid_response_raises_with_the_tokens_used(
    invalid_content: str | None,
) -> None:
    fake = FakeDeepSeek(*(FakeDeepSeek.reply(invalid_content) for _ in range(MAX_ATTEMPTS)))
    provider = _deepseek_provider(fake)

    with pytest.raises(AIProviderError) as exc_info:
        await provider.analyze_request(PAYLOAD, "es")
    await provider.aclose()

    assert exc_info.value.reason is ProviderFailure.INVALID_RESPONSE
    assert exc_info.value.tokens_used == 70 * MAX_ATTEMPTS
    assert len(fake.requests) == MAX_ATTEMPTS


@pytest.mark.parametrize(
    ("status", "reason"),
    [
        (401, ProviderFailure.UNAVAILABLE),
        (429, ProviderFailure.RATE_LIMITED),
        (503, ProviderFailure.UNAVAILABLE),
    ],
)
async def test_api_errors_are_not_retried_on_demand(status: int, reason: ProviderFailure) -> None:
    fake = FakeDeepSeek(httpx2.Response(status, json={"error": {"message": "x"}}))
    provider = _deepseek_provider(fake)

    with pytest.raises(AIProviderError) as exc_info:
        await provider.analyze_request(PAYLOAD, "es")
    await provider.aclose()

    assert exc_info.value.reason is reason
    assert len(fake.requests) == 1
