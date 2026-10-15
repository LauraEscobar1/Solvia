from enum import StrEnum
from functools import lru_cache
from typing import Literal, Self

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEFAULT_JWT_SECRET = "change-me-solvia-development-only-secret"  # noqa: S105
MIN_JWT_SECRET_LENGTH = 32
WEAK_JWT_SECRETS = frozenset({DEFAULT_JWT_SECRET, "change-me"})


class Environment(StrEnum):
    DEVELOPMENT = "development"
    TEST = "test"
    PRODUCTION = "production"


class AIProviderName(StrEnum):
    NONE = "none"
    DEEPSEEK = "deepseek"


LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=("../.env", ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        hide_input_in_errors=True,
    )

    environment: Environment = Environment.DEVELOPMENT
    log_level: LogLevel = "INFO"

    database_url: SecretStr = SecretStr("postgresql+asyncpg://solvia:solvia@localhost:5432/solvia")
    database_echo: bool = False
    database_connect_timeout_seconds: float = Field(default=5.0, gt=0)

    cors_origins: list[str] = [
        "http://localhost:1420",
        "tauri://localhost",
        "http://tauri.localhost",
    ]

    jwt_secret: SecretStr = SecretStr(DEFAULT_JWT_SECRET)
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_access_token_minutes: int = Field(default=30, gt=0)
    refresh_token_days: int = Field(default=30, gt=0)
    login_rate_limit_attempts: int = Field(default=5, gt=0)
    login_rate_limit_window_seconds: int = Field(default=60, gt=0)

    ai_provider: AIProviderName = AIProviderName.NONE
    deepseek_api_key: SecretStr | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"
    deepseek_timeout_seconds: float = Field(default=30.0, gt=0)
    deepseek_max_tokens: int = Field(default=1024, gt=0)

    @field_validator("deepseek_api_key", mode="before")
    @classmethod
    def _empty_key_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @model_validator(mode="after")
    def _validate_consistency(self) -> Self:
        if self.environment is Environment.PRODUCTION:
            secret = self.jwt_secret.get_secret_value()
            if secret in WEAK_JWT_SECRETS or len(secret) < MIN_JWT_SECRET_LENGTH:
                msg = (
                    "JWT_SECRET debe definirse con un valor propio de al menos "
                    f"{MIN_JWT_SECRET_LENGTH} caracteres en producción"
                )
                raise ValueError(msg)
        if self.ai_provider is AIProviderName.DEEPSEEK and self.deepseek_api_key is None:
            msg = "DEEPSEEK_API_KEY es obligatoria cuando AI_PROVIDER=deepseek"
            raise ValueError(msg)
        return self

    @property
    def is_production(self) -> bool:
        return self.environment is Environment.PRODUCTION


@lru_cache
def get_settings() -> Settings:
    return Settings()
