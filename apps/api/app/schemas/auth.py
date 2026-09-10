from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


USERNAME_PATTERN = r"^[A-Za-z0-9_.-]+$"


class SetupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50, pattern=USERNAME_PATTERN)
    password: SecretStr = Field(min_length=12, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize_username(cls, username: str) -> str:
        return username.strip()

    @field_validator("password")
    @classmethod
    def validate_password_strength(cls, password: SecretStr) -> SecretStr:
        value = password.get_secret_value()
        character_groups = (
            any(character.islower() for character in value),
            any(character.isupper() for character in value),
            any(character.isdigit() for character in value),
            any(not character.isalnum() for character in value),
        )
        if not all(character_groups):
            raise ValueError(
                "Password must include uppercase, lowercase, number, and symbol."
            )
        return password


class LoginRequest(BaseModel):
    username: str = Field(min_length=1, max_length=255)
    password: SecretStr = Field(min_length=1, max_length=128)


class TokenResponse(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_active: bool
    created_at: datetime
