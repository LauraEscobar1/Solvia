import pytest
from pydantic import ValidationError

from app.ai.base import AnalysisKind
from app.ai.deepseek_provider import DeepSeekProvider
from app.ai.factory import build_ai_provider
from app.core.config import AIProviderName, Settings

pytestmark = pytest.mark.live

PAYLOAD = {
    "request": {
        "code": "SOL-0001",
        "area": "Soporte TI",
        "priority": "high",
        "status": "received",
        "hours_open": 40.0,
        "has_assignee": False,
        "sla_total_hours": 104.0,
        "sla_consumed_pct": 38,
        "hours_to_due": 64.0,
    },
    "rules_risk": {
        "score": 72,
        "factors": [{"factor": "stage_delay", "value": 40.0, "points": 25.0}],
    },
}


def _live_provider() -> DeepSeekProvider | None:
    try:
        settings = Settings()
    except ValidationError:
        return None
    if settings.deepseek_api_key is None:
        return None
    provider = build_ai_provider(
        settings.model_copy(update={"ai_provider": AIProviderName.DEEPSEEK})
    )
    assert isinstance(provider, DeepSeekProvider)
    return provider


async def test_deepseek_returns_a_valid_request_analysis() -> None:
    provider = _live_provider()
    if provider is None:
        pytest.skip("Sin DEEPSEEK_API_KEY: se omite la prueba real contra DeepSeek")
    try:
        completion = await provider.analyze_request(PAYLOAD, "es")
    finally:
        await provider.aclose()

    assert 0 <= completion.result.risk_score <= 100
    assert completion.result.summary
    assert completion.model == provider.model_for(AnalysisKind.REQUEST)
    assert completion.tokens_used > 0
