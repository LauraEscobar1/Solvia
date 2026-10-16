import json
from collections.abc import Callable
from typing import Any

import httpx2
from pydantic import SecretStr

from app.ai.deepseek_provider import DeepSeekProvider
from app.ai.factory import build_ai_provider
from app.core.config import AIProviderName
from tests.conftest import make_settings

FAKE_KEY = "sk-test-not-a-real-key"

Reply = httpx2.Response | Callable[[httpx2.Request], httpx2.Response] | Exception


def completion(
    content: str | None, *, total_tokens: int = 800, model: str = "deepseek-flash"
) -> httpx2.Response:
    return httpx2.Response(
        200,
        json={
            "id": "chatcmpl-test",
            "object": "chat.completion",
            "created": 1_760_000_000,
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "finish_reason": "stop",
                    "message": {"role": "assistant", "content": content},
                }
            ],
            "usage": {
                "prompt_tokens": total_tokens - 200,
                "completion_tokens": 200,
                "total_tokens": total_tokens,
            },
        },
    )


def error(status: int) -> httpx2.Response:
    return httpx2.Response(status, json={"error": {"message": "fallo simulado"}})


def request_reply(risk_score: int = 84, **overrides: Any) -> httpx2.Response:
    body: dict[str, Any] = {
        "risk_score": risk_score,
        "summary": "Sin responsable y cerca de vencer.",
        "causes": ["Lleva mucho tiempo en la etapa"],
        "actions": [{"title": "Asignar hoy", "detail": "Asigna la solicitud a alguien del área."}],
        **overrides,
    }
    return completion(json.dumps(body))


def overview_reply(**overrides: Any) -> httpx2.Response:
    body: dict[str, Any] = {
        "summary": "Hay acumulación en recibidas.",
        "findings": [],
        "recommendations": [],
        **overrides,
    }
    return completion(json.dumps(body), model="deepseek-v4-pro", total_tokens=3000)


class ScriptedDeepSeek:
    def __init__(self, *replies: Reply) -> None:
        self._replies = list(replies)
        self.requests: list[httpx2.Request] = []
        self.sleeps: list[float] = []

    def add(self, *replies: Reply) -> None:
        self._replies.extend(replies)

    def __call__(self, request: httpx2.Request) -> httpx2.Response:
        self.requests.append(request)
        reply = self._replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        if isinstance(reply, httpx2.Response):
            return reply
        return reply(request)

    def body(self, index: int = -1) -> dict[str, Any]:
        body: dict[str, Any] = json.loads(self.requests[index].content)
        return body

    def sent_text(self) -> str:
        return "\n".join(request.content.decode() for request in self.requests)

    async def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)


def scripted_provider(script: ScriptedDeepSeek, **overrides: Any) -> DeepSeekProvider:
    settings = make_settings(
        ai_provider=AIProviderName.DEEPSEEK, deepseek_api_key=SecretStr(FAKE_KEY), **overrides
    )
    provider = build_ai_provider(
        settings,
        http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(script)),
        sleep=script.sleep,
    )
    assert isinstance(provider, DeepSeekProvider)
    return provider
