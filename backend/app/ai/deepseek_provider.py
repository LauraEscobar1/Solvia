from typing import Final

import httpx2
import structlog
from fastapi import status
from openai import APIError, AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel, ConfigDict, Field, SecretStr, ValidationError

from app.ai.base import AnalysisResult, Language, RequestMetrics
from app.ai.heuristics import heuristic_risk_score, risk_level_for
from app.ai.prompts import RETRY_INSTRUCTION, build_messages
from app.core.config import AIProviderName
from app.core.errors import AppError, ErrorCode
from app.schemas.health import AIProviderHealth

logger = structlog.get_logger(__name__)

MAX_ATTEMPTS: Final = 2
_TEMPERATURE: Final = 0.2
_THINKING_DISABLED: Final = {"thinking": {"type": "disabled"}}


class DeepSeekAnalysis(BaseModel):
    model_config = ConfigDict(extra="ignore")

    risk_score: float = Field(ge=0, le=1)
    summary: str = Field(min_length=1, max_length=600)


class DeepSeekProvider:
    def __init__(
        self,
        *,
        api_key: SecretStr,
        base_url: str,
        model: str,
        timeout_seconds: float,
        max_tokens: int,
        http_client: httpx2.AsyncClient | None = None,
    ) -> None:
        self._model = model
        self._max_tokens = max_tokens
        self._client = AsyncOpenAI(
            api_key=api_key.get_secret_value(),
            base_url=base_url,
            timeout=timeout_seconds,
            http_client=http_client,
        )

    async def analyze_request(self, metrics: RequestMetrics, language: Language) -> AnalysisResult:
        messages = build_messages(metrics, language, heuristic_risk_score(metrics))

        for attempt in range(1, MAX_ATTEMPTS + 1):
            content = await self._complete(messages)
            try:
                parsed = DeepSeekAnalysis.model_validate_json(content or "")
            except ValidationError as exc:
                logger.warning(
                    "ai_invalid_response",
                    provider=AIProviderName.DEEPSEEK,
                    attempt=attempt,
                    error_count=exc.error_count(),
                )
                if content:
                    messages = [*messages, {"role": "assistant", "content": content}]
                messages = [*messages, {"role": "user", "content": RETRY_INSTRUCTION}]
                continue

            score = round(parsed.risk_score, 4)
            return AnalysisResult(
                risk_score=score,
                risk_level=risk_level_for(score),
                summary=parsed.summary.strip(),
                provider=AIProviderName.DEEPSEEK,
            )

        raise AppError(ErrorCode.AI_INVALID_RESPONSE, status_code=status.HTTP_502_BAD_GATEWAY)

    async def _complete(self, messages: list[ChatCompletionMessageParam]) -> str | None:
        try:
            response = await self._client.chat.completions.create(
                model=self._model,
                messages=messages,
                response_format={"type": "json_object"},
                max_tokens=self._max_tokens,
                temperature=_TEMPERATURE,
                stream=False,
                extra_body=_THINKING_DISABLED,
            )
        except APIError as exc:
            logger.warning(
                "ai_provider_error",
                provider=AIProviderName.DEEPSEEK,
                error_type=type(exc).__name__,
                status=getattr(exc, "status_code", None),
            )
            raise AppError(
                ErrorCode.AI_PROVIDER_UNAVAILABLE,
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            ) from exc

        if not response.choices:
            return None
        return response.choices[0].message.content

    def health(self) -> AIProviderHealth:
        return AIProviderHealth(
            provider=AIProviderName.DEEPSEEK, model=self._model, configured=True
        )

    async def aclose(self) -> None:
        await self._client.close()
