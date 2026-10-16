from typing import Any

from app.ai.base import (
    AIProviderError,
    AnalysisKind,
    Completion,
    Language,
    OverviewAnalysis,
    ProviderFailure,
    RequestAnalysis,
)
from app.core.config import AIProviderName
from app.schemas.health import AIProviderHealth


class NullProvider:
    name = AIProviderName.NONE

    def model_for(self, kind: AnalysisKind) -> str | None:  # noqa: ARG002
        return None

    async def analyze_request(
        self,
        payload: dict[str, Any],  # noqa: ARG002
        language: Language,  # noqa: ARG002
        *,
        request_text: str | None = None,  # noqa: ARG002
        retry_transient: bool = False,  # noqa: ARG002
    ) -> Completion[RequestAnalysis]:
        raise AIProviderError(ProviderFailure.DISABLED)

    async def analyze_overview(
        self,
        payload: dict[str, Any],  # noqa: ARG002
        language: Language,  # noqa: ARG002
        *,
        retry_transient: bool = False,  # noqa: ARG002
    ) -> Completion[OverviewAnalysis]:
        raise AIProviderError(ProviderFailure.DISABLED)

    def health(self) -> AIProviderHealth:
        return AIProviderHealth(provider=self.name, model=None, configured=True)

    async def aclose(self) -> None:
        return None
