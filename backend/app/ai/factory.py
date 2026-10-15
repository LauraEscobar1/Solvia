from typing import assert_never

import httpx2

from app.ai.base import AIProvider
from app.ai.deepseek_provider import DeepSeekProvider
from app.ai.null_provider import NullProvider
from app.core.config import AIProviderName, Settings


def build_ai_provider(
    settings: Settings, *, http_client: httpx2.AsyncClient | None = None
) -> AIProvider:
    match settings.ai_provider:
        case AIProviderName.NONE:
            return NullProvider()
        case AIProviderName.DEEPSEEK:
            if settings.deepseek_api_key is None:
                msg = "DEEPSEEK_API_KEY es obligatoria cuando AI_PROVIDER=deepseek"
                raise ValueError(msg)
            return DeepSeekProvider(
                api_key=settings.deepseek_api_key,
                base_url=settings.deepseek_base_url,
                model=settings.deepseek_model,
                timeout_seconds=settings.deepseek_timeout_seconds,
                max_tokens=settings.deepseek_max_tokens,
                http_client=http_client,
            )
        case _:
            assert_never(settings.ai_provider)
