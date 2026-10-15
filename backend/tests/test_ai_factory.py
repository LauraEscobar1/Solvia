import json
from collections.abc import Callable
from typing import Any

import httpx2
import pytest
from pydantic import SecretStr

from app.ai.base import RequestMetrics, RiskLevel
from app.ai.deepseek_provider import MAX_ATTEMPTS, DeepSeekProvider
from app.ai.factory import build_ai_provider
from app.ai.null_provider import NullProvider
from app.ai.prompts import RETRY_INSTRUCTION
from app.core.config import AIProviderName
from app.core.errors import AppError, ErrorCode
from app.models.enums import RequestStatus
from tests.conftest import make_settings

FAKE_KEY = "sk-test-not-a-real-key"

METRICS = RequestMetrics(
    status=RequestStatus.IN_PROGRESS,
    hours_open=36,
    hours_in_status=30,
    sla_hours=40,
    reassignment_count=2,
    assignee_open_requests=12,
)


def _completion(content: str | None) -> dict[str, Any]:
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
        "usage": {"prompt_tokens": 50, "completion_tokens": 20, "total_tokens": 70},
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
    def reply(content: str | None) -> httpx2.Response:
        return httpx2.Response(200, json=_completion(content))


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


async def test_factory_returns_deepseek_provider_when_configured() -> None:
    provider = _deepseek_provider(FakeDeepSeek())

    health = provider.health()
    assert health.provider is AIProviderName.DEEPSEEK
    assert health.model == "deepseek-flash"
    assert health.configured is True
    await provider.aclose()


async def test_null_provider_returns_heuristic_score() -> None:
    result = await NullProvider().analyze_request(METRICS, "es")

    assert result.risk_score == pytest.approx(0.9)
    assert result.risk_level is RiskLevel.CRITICAL
    assert result.summary is None
    assert result.provider is AIProviderName.NONE


async def test_null_provider_scores_completed_requests_as_no_risk() -> None:
    completed = METRICS.model_copy(update={"status": RequestStatus.COMPLETED})

    result = await NullProvider().analyze_request(completed, "en")

    assert result.risk_score == 0
    assert result.risk_level is RiskLevel.LOW


async def test_deepseek_sends_expected_request_and_parses_response() -> None:
    fake = FakeDeepSeek(
        FakeDeepSeek.reply('{"risk_score": 0.75, "summary": "Lleva 30 h sin avanzar."}')
    )
    provider = _deepseek_provider(fake)

    result = await provider.analyze_request(METRICS, "es")
    await provider.aclose()

    assert result.risk_score == 0.75
    assert result.risk_level is RiskLevel.HIGH
    assert result.summary == "Lleva 30 h sin avanzar."
    assert result.provider is AIProviderName.DEEPSEEK

    request = fake.requests[0]
    assert str(request.url) == "https://api.deepseek.com/chat/completions"
    assert request.headers["authorization"] == f"Bearer {FAKE_KEY}"
    body = fake.body(0)
    assert body["model"] == "deepseek-flash"
    assert body["response_format"] == {"type": "json_object"}
    assert body["thinking"] == {"type": "disabled"}
    assert "json" in body["messages"][0]["content"].lower()
    assert "Spanish" in body["messages"][0]["content"]


async def test_deepseek_retries_once_when_response_is_invalid() -> None:
    fake = FakeDeepSeek(
        FakeDeepSeek.reply("esto no es json"),
        FakeDeepSeek.reply('{"risk_score": 0.3, "summary": "Within SLA."}'),
    )
    provider = _deepseek_provider(fake)

    result = await provider.analyze_request(METRICS, "en")
    await provider.aclose()

    assert result.risk_score == 0.3
    assert result.risk_level is RiskLevel.LOW
    assert len(fake.requests) == 2
    assert fake.body(1)["messages"][-1] == {"role": "user", "content": RETRY_INSTRUCTION}


@pytest.mark.parametrize(
    "invalid_content",
    [
        None,
        "",
        '{"risk_score": 1.7, "summary": "fuera de rango"}',
        '{"summary": "sin puntaje"}',
    ],
)
async def test_deepseek_fails_after_second_invalid_response(invalid_content: str | None) -> None:
    fake = FakeDeepSeek(*(FakeDeepSeek.reply(invalid_content) for _ in range(MAX_ATTEMPTS)))
    provider = _deepseek_provider(fake)

    with pytest.raises(AppError) as exc_info:
        await provider.analyze_request(METRICS, "es")
    await provider.aclose()

    assert exc_info.value.code is ErrorCode.AI_INVALID_RESPONSE
    assert len(fake.requests) == MAX_ATTEMPTS


async def test_deepseek_api_error_maps_to_provider_unavailable() -> None:
    fake = FakeDeepSeek(httpx2.Response(401, json={"error": {"message": "invalid key"}}))
    provider = _deepseek_provider(fake)

    with pytest.raises(AppError) as exc_info:
        await provider.analyze_request(METRICS, "es")
    await provider.aclose()

    assert exc_info.value.code is ErrorCode.AI_PROVIDER_UNAVAILABLE
    assert exc_info.value.status_code == 503
