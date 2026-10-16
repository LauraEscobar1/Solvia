import asyncio
import random
from collections.abc import Awaitable, Callable
from typing import Any, Final

import httpx2
import structlog
from openai import (
    APIConnectionError,
    APIError,
    APIStatusError,
    APITimeoutError,
    AsyncOpenAI,
    InternalServerError,
    RateLimitError,
    omit,
)
from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel, SecretStr, ValidationError

from app.ai.base import (
    AIProviderError,
    AnalysisKind,
    Completion,
    Language,
    OverviewAnalysis,
    ProviderFailure,
    RequestAnalysis,
)
from app.ai.prompts import RETRY_INSTRUCTION, overview_messages, request_messages
from app.core.config import AIProviderName
from app.schemas.health import AIProviderHealth

logger = structlog.get_logger(__name__)

MAX_ATTEMPTS: Final = 2
TRANSIENT_DELAY_SECONDS: Final = (5.0, 10.0)
_TEMPERATURE: Final = 0.2

Sleep = Callable[[float], Awaitable[None]]


class _CallSettings(BaseModel):
    model: str
    timeout_seconds: float
    max_tokens: int
    extra_body: dict[str, Any]
    temperature: float | None


def _failure_for(exc: APIError) -> ProviderFailure:
    if isinstance(exc, RateLimitError):
        return ProviderFailure.RATE_LIMITED
    if isinstance(exc, APITimeoutError):
        return ProviderFailure.TIMEOUT
    return ProviderFailure.UNAVAILABLE


def _is_transient(exc: APIError) -> bool:
    return isinstance(
        exc, RateLimitError | InternalServerError | APITimeoutError | APIConnectionError
    )


class DeepSeekProvider:
    name = AIProviderName.DEEPSEEK

    def __init__(
        self,
        *,
        api_key: SecretStr,
        base_url: str,
        model: str,
        timeout_seconds: float,
        max_tokens: int,
        deep_model: str,
        deep_timeout_seconds: float,
        deep_max_tokens: int,
        reasoning_effort: str,
        http_client: httpx2.AsyncClient | None = None,
        sleep: Sleep = asyncio.sleep,
    ) -> None:
        self._request_call = _CallSettings(
            model=model,
            timeout_seconds=timeout_seconds,
            max_tokens=max_tokens,
            extra_body={"thinking": {"type": "disabled"}},
            temperature=_TEMPERATURE,
        )
        self._overview_call = _CallSettings(
            model=deep_model,
            timeout_seconds=deep_timeout_seconds,
            max_tokens=deep_max_tokens,
            extra_body={"thinking": {"type": "enabled"}, "reasoning_effort": reasoning_effort},
            temperature=None,
        )
        self._sleep = sleep
        self._client = AsyncOpenAI(
            api_key=api_key.get_secret_value(),
            base_url=base_url,
            max_retries=0,
            http_client=http_client,
        )

    def model_for(self, kind: AnalysisKind) -> str:
        call = self._request_call if kind is AnalysisKind.REQUEST else self._overview_call
        return call.model

    async def analyze_request(
        self,
        payload: dict[str, Any],
        language: Language,
        *,
        request_text: str | None = None,
        retry_transient: bool = False,
    ) -> Completion[RequestAnalysis]:
        return await self._analyze(
            AnalysisKind.REQUEST,
            request_messages(payload, language, request_text),
            RequestAnalysis,
            retry_transient=retry_transient,
        )

    async def analyze_overview(
        self,
        payload: dict[str, Any],
        language: Language,
        *,
        retry_transient: bool = False,
    ) -> Completion[OverviewAnalysis]:
        return await self._analyze(
            AnalysisKind.OVERVIEW,
            overview_messages(payload, language),
            OverviewAnalysis,
            retry_transient=retry_transient,
        )

    async def _analyze[T: BaseModel](
        self,
        kind: AnalysisKind,
        messages: list[ChatCompletionMessageParam],
        schema: type[T],
        *,
        retry_transient: bool,
    ) -> Completion[T]:
        call = self._request_call if kind is AnalysisKind.REQUEST else self._overview_call
        tokens = 0
        for attempt in range(1, MAX_ATTEMPTS + 1):
            content, used = await self._complete(
                call, messages, kind, retry_transient=retry_transient, tokens_so_far=tokens
            )
            tokens += used
            try:
                result = schema.model_validate_json(content or "")
            except ValidationError as exc:
                logger.warning(
                    "ai_invalid_response",
                    provider=self.name,
                    kind=kind,
                    attempt=attempt,
                    error_count=exc.error_count(),
                )
                if content:
                    messages = [*messages, {"role": "assistant", "content": content}]
                messages = [*messages, {"role": "user", "content": RETRY_INSTRUCTION}]
                continue
            return Completion(result=result, model=call.model, tokens_used=tokens)
        raise AIProviderError(ProviderFailure.INVALID_RESPONSE, tokens_used=tokens)

    async def _complete(
        self,
        call: _CallSettings,
        messages: list[ChatCompletionMessageParam],
        kind: AnalysisKind,
        *,
        retry_transient: bool,
        tokens_so_far: int,
    ) -> tuple[str | None, int]:
        attempts = 2 if retry_transient else 1
        for attempt in range(1, attempts + 1):
            try:
                response = await self._client.chat.completions.create(
                    model=call.model,
                    messages=messages,
                    response_format={"type": "json_object"},
                    max_tokens=call.max_tokens,
                    timeout=call.timeout_seconds,
                    stream=False,
                    extra_body=call.extra_body,
                    temperature=omit if call.temperature is None else call.temperature,
                )
            except APIError as exc:
                logger.warning(
                    "ai_provider_error",
                    provider=self.name,
                    kind=kind,
                    attempt=attempt,
                    error_type=type(exc).__name__,
                    status=exc.status_code if isinstance(exc, APIStatusError) else None,
                )
                if attempt < attempts and _is_transient(exc):
                    await self._sleep(random.uniform(*TRANSIENT_DELAY_SECONDS))  # noqa: S311
                    continue
                raise AIProviderError(_failure_for(exc), tokens_used=tokens_so_far) from exc
            used = response.usage.total_tokens if response.usage else 0
            content = response.choices[0].message.content if response.choices else None
            return content, used
        raise AIProviderError(ProviderFailure.UNAVAILABLE, tokens_used=tokens_so_far)

    def health(self) -> AIProviderHealth:
        return AIProviderHealth(provider=self.name, model=self._request_call.model, configured=True)

    async def aclose(self) -> None:
        await self._client.close()
