from pathlib import Path

import pytest
from pydantic import SecretStr, ValidationError

from app.core.config import (
    DEFAULT_JWT_SECRET,
    AIProviderName,
    Environment,
    Settings,
)
from tests.conftest import make_settings

FAKE_KEY = "sk-test-not-a-real-key"
STRONG_SECRET = "x" * 48


def test_defaults_are_safe_for_development() -> None:
    settings = Settings(_env_file=None)

    assert settings.environment is Environment.DEVELOPMENT
    assert settings.ai_provider is AIProviderName.NONE
    assert settings.deepseek_api_key is None
    assert settings.deepseek_model == "deepseek-flash"
    assert settings.deepseek_base_url == "https://api.deepseek.com"


def test_secrets_are_secretstr_and_masked(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_SECRET", STRONG_SECRET)
    monkeypatch.setenv("AI_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", FAKE_KEY)

    settings = Settings(_env_file=None)

    assert isinstance(settings.jwt_secret, SecretStr)
    assert isinstance(settings.deepseek_api_key, SecretStr)
    assert settings.deepseek_api_key.get_secret_value() == FAKE_KEY
    for rendered in (repr(settings), str(settings), settings.model_dump_json()):
        assert FAKE_KEY not in rendered
        assert STRONG_SECRET not in rendered


def test_reads_dotenv_file(tmp_path: Path) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("ENVIRONMENT=test\nLOG_LEVEL=DEBUG\nDEEPSEEK_MODEL=otro-modelo\n")

    settings = Settings(_env_file=env_file)

    assert settings.environment is Environment.TEST
    assert settings.log_level == "DEBUG"
    assert settings.deepseek_model == "otro-modelo"


def test_environment_variables_override_dotenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    env_file = tmp_path / ".env"
    env_file.write_text("LOG_LEVEL=DEBUG\n")
    monkeypatch.setenv("LOG_LEVEL", "WARNING")

    assert Settings(_env_file=env_file).log_level == "WARNING"


@pytest.mark.parametrize("secret", [DEFAULT_JWT_SECRET, "corto"])
def test_production_rejects_default_or_weak_jwt_secret(secret: str) -> None:
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        make_settings(environment=Environment.PRODUCTION, jwt_secret=SecretStr(secret))


def test_validation_errors_never_echo_secrets(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "production")
    monkeypatch.setenv("JWT_SECRET", "secreto-debil")
    monkeypatch.setenv("AI_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", FAKE_KEY)

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    message = str(exc_info.value)
    assert "JWT_SECRET" in message
    for secret in (FAKE_KEY, "secreto-debil"):
        assert secret[-10:] not in message


def test_production_accepts_strong_jwt_secret() -> None:
    settings = make_settings(
        environment=Environment.PRODUCTION, jwt_secret=SecretStr(STRONG_SECRET)
    )
    assert settings.is_production


@pytest.mark.parametrize("key", [None, "", "   "])
def test_deepseek_requires_api_key(key: str | None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "deepseek")
    if key is not None:
        monkeypatch.setenv("DEEPSEEK_API_KEY", key)

    with pytest.raises(ValidationError, match="DEEPSEEK_API_KEY"):
        Settings(_env_file=None)
