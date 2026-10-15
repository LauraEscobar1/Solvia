from app.ai.base import AnalysisResult, Language, RequestMetrics
from app.ai.heuristics import heuristic_risk_score, risk_level_for
from app.core.config import AIProviderName
from app.schemas.health import AIProviderHealth


class NullProvider:
    async def analyze_request(
        self,
        metrics: RequestMetrics,
        language: Language,  # noqa: ARG002
    ) -> AnalysisResult:
        score = heuristic_risk_score(metrics)
        return AnalysisResult(
            risk_score=score,
            risk_level=risk_level_for(score),
            summary=None,
            provider=AIProviderName.NONE,
        )

    def health(self) -> AIProviderHealth:
        return AIProviderHealth(provider=AIProviderName.NONE, model=None, configured=True)

    async def aclose(self) -> None:
        return None
