from functools import lru_cache
from pathlib import Path

from pydantic import AnyHttpUrl, Field, PostgresDsn, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    database_url: PostgresDsn
    jwt_secret: SecretStr = Field(min_length=32)
    access_token_expire_minutes: int = Field(default=30, gt=0, le=1440)
    ollama_base_url: AnyHttpUrl = "http://localhost:11434"
    ollama_model: str = Field(default="qwen3:8b", min_length=1, max_length=100)
    ollama_timeout_seconds: float = Field(default=60, gt=0, le=300)
    ai_note_analysis_enabled: bool = True

    @field_validator("jwt_secret")
    @classmethod
    def reject_placeholder_secret(cls, secret: SecretStr) -> SecretStr:
        if secret.get_secret_value().startswith("replace-"):
            raise ValueError("JWT_SECRET must be replaced with a random secret.")
        return secret

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
