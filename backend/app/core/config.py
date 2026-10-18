from enum import StrEnum
from functools import lru_cache
from typing import Literal, Self
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.models.enums import UILanguage

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
        "https://tauri.localhost",
    ]

    jwt_secret: SecretStr = SecretStr(DEFAULT_JWT_SECRET)
    jwt_algorithm: Literal["HS256", "HS384", "HS512"] = "HS256"
    jwt_access_token_minutes: int = Field(default=30, gt=0)
    refresh_token_days: int = Field(default=30, gt=0)
    login_rate_limit_attempts: int = Field(default=5, gt=0)
    login_rate_limit_window_seconds: int = Field(default=60, gt=0)

    organization_name: str = Field(default="", max_length=120)
    organization_timezone: str = "America/Bogota"
    alerts_job_enabled: bool = True
    alerts_job_interval_minutes: int = Field(default=15, gt=0)
    bottleneck_min_count: int = Field(default=3, ge=1)

    seed_admin_email: str | None = None
    seed_admin_name: str = "Administrador"
    seed_admin_password: SecretStr | None = None
    seed_demo_password: SecretStr | None = None

    ai_provider: AIProviderName = AIProviderName.NONE
    deepseek_api_key: SecretStr | None = None
    deepseek_base_url: str = "https://api.deepseek.com"
    deepseek_model: str = "deepseek-flash"
    deepseek_timeout_seconds: float = Field(default=30.0, gt=0)
    deepseek_max_tokens: int = Field(default=1024, gt=0)
    deepseek_model_deep: str = "deepseek-v4-pro"
    deepseek_reasoning_effort: Literal["low", "high", "max"] = "high"
    deepseek_deep_timeout_seconds: float = Field(default=120.0, gt=0)
    deepseek_deep_max_tokens: int = Field(default=16000, gt=0)
    ai_send_request_text: bool = False
    ai_daily_token_budget: int = Field(default=200_000, ge=0)
    ai_user_hourly_limit: int = Field(default=10, gt=0)
    ai_automatic_enabled: bool = True
    ai_automatic_max_per_run: int = Field(default=10, ge=0)
    ai_cache_hours: int = Field(default=6, gt=0)
    organization_language: UILanguage = UILanguage.ES

    @field_validator(
        "deepseek_api_key",
        "seed_admin_email",
        "seed_admin_password",
        "seed_demo_password",
        mode="before",
    )
    @classmethod
    def _blank_is_none(cls, value: object) -> object:
        if isinstance(value, str) and not value.strip():
            return None
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def _async_driver(cls, value: object) -> object:
        raw = value.get_secret_value() if isinstance(value, SecretStr) else value
        if not isinstance(raw, str):
            return value
        for plain in ("postgresql://", "postgres://"):
            if raw.startswith(plain):
                return f"postgresql+asyncpg://{raw.removeprefix(plain)}"
        return raw

    @field_validator("organization_name", mode="before")
    @classmethod
    def _strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("organization_timezone")
    @classmethod
    def _known_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            msg = f"ORGANIZATION_TIMEZONE no es una zona horaria IANA válida: {value}"
            raise ValueError(msg) from exc
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

    @property
    def timezone(self) -> ZoneInfo:
        return ZoneInfo(self.organization_timezone)


@lru_cache
def get_settings() -> Settings:
    return Settings()
