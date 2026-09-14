from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.journal_entry import JOURNAL_CONTENT_MAX_LENGTH, JOURNAL_TITLE_MAX_LENGTH


def trim_optional_title(value: str | None) -> str | None:
    if value is None:
        return None
    value = value.strip()
    return value or None


def trim_content(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("Content must contain text.")
    return value


def local_time(value: time) -> time:
    if value.tzinfo is not None:
        raise ValueError("Entry time must not include a timezone.")
    return value


class JournalEntryCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=JOURNAL_TITLE_MAX_LENGTH)
    content: str = Field(max_length=JOURNAL_CONTENT_MAX_LENGTH)
    entry_date: date
    entry_time: time

    _title = field_validator("title")(trim_optional_title)
    _content = field_validator("content")(trim_content)
    _time = field_validator("entry_time")(local_time)


class JournalEntryUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str | None = Field(default=None, max_length=JOURNAL_TITLE_MAX_LENGTH)
    content: str | None = Field(default=None, max_length=JOURNAL_CONTENT_MAX_LENGTH)
    entry_date: date | None = None
    entry_time: time | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str | None) -> str | None:
        return trim_optional_title(value)

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Content cannot be null.")
        return trim_content(value)

    @field_validator("entry_time")
    @classmethod
    def validate_time(cls, value: time | None) -> time | None:
        if value is None:
            raise ValueError("Entry time cannot be null.")
        return local_time(value)

    @field_validator("entry_date")
    @classmethod
    def validate_date(cls, value: date | None) -> date | None:
        if value is None:
            raise ValueError("Entry date cannot be null.")
        return value


class JournalEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    title: str | None
    content: str
    entry_date: date
    entry_time: time
    created_at: datetime
    updated_at: datetime


class JournalEntryListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entries: list[JournalEntryResponse]
    total: int
    offset: int
    limit: int
