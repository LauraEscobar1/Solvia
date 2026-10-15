from openai.types.chat import ChatCompletionMessageParam

from app.ai.base import Language, RequestMetrics

_LANGUAGE_NAMES: dict[Language, str] = {"es": "Spanish", "en": "English"}

_SYSTEM_PROMPT = """\
You are an operations analyst for a request-management system.
Requests move through these statuses: received -> assigned -> in_progress -> completed.
Given anonymised metrics of one request, estimate the risk that it is delayed or stuck in a
bottleneck.

Reply ONLY with a json object with exactly these keys:
- "risk_score": number between 0 and 1 (0 = no risk, 1 = certainly delayed or blocked)
- "summary": at most two short sentences explaining the main cause, written in {language}

Example output:
{{"risk_score": 0.82, "summary": "..."}}
"""

RETRY_INSTRUCTION = (
    "Your previous answer was not a valid json object with the keys "
    '"risk_score" and "summary". Reply again with only that json object.'
)


def build_messages(
    metrics: RequestMetrics, language: Language, heuristic_score: float
) -> list[ChatCompletionMessageParam]:
    return [
        {
            "role": "system",
            "content": _SYSTEM_PROMPT.format(language=_LANGUAGE_NAMES[language]),
        },
        {
            "role": "user",
            "content": (
                f"Request metrics (json): {metrics.model_dump_json()}\n"
                f"Heuristic risk score (share of SLA consumed): {heuristic_score}"
            ),
        },
    ]
