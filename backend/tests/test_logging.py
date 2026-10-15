from pydantic import SecretStr

from app.core.logging import REDACTED, redact_secrets


def test_redacts_sensitive_keys() -> None:
    event = redact_secrets(
        None,
        "info",
        {
            "event": "login",
            "password": "hunter2",
            "deepseek_api_key": "sk-live",
            "Authorization": "Bearer abc.def",
            "user": "ana",
        },
    )

    assert event["password"] == REDACTED
    assert event["deepseek_api_key"] == REDACTED
    assert event["Authorization"] == REDACTED
    assert event["user"] == "ana"


def test_redacts_secrets_inside_values() -> None:
    key = "sk-" + "a1b2c3d4" * 4
    event = redact_secrets(
        None,
        "error",
        {
            "event": f"fallo con clave {key}",
            "url": "postgresql+asyncpg://solvia:supersecreta@db:5432/solvia",
            "nested": {"token_header": "Bearer xyz", "items": [SecretStr("oculto")]},
        },
    )

    assert key not in event["event"]
    assert "supersecreta" not in event["url"]
    assert event["nested"]["items"] == [REDACTED]
    assert "xyz" not in str(event["nested"])


def test_keeps_non_sensitive_token_counts() -> None:
    event = redact_secrets(None, "info", {"event": "ai_call", "max_tokens": 1024})

    assert event["max_tokens"] == 1024
