from datetime import date, datetime, time
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.planner_task import PLANNER_TASK_TITLE_MAX_LENGTH


def normalize_title(title: str) -> str:
    normalized = title.strip()
    if not normalized:
        raise ValueError("Title cannot be blank.")
    return normalized


def validate_local_time(value: time) -> time:
    if value.tzinfo is not None:
        raise ValueError("Task times must not include a timezone.")
    return value


class PlannerTaskCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=PLANNER_TASK_TITLE_MAX_LENGTH)
    task_date: date
    start_time: time
    end_time: time

    @field_validator("title")
    @classmethod
    def validate_title(cls, title: str) -> str:
        return normalize_title(title)

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_time_without_timezone(cls, value: time) -> time:
        return validate_local_time(value)

    @model_validator(mode="after")
    def validate_time_range(self) -> "PlannerTaskCreate":
        if self.end_time <= self.start_time:
            raise ValueError("End time must be later than start time.")
        return self


class PlannerTaskUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=PLANNER_TASK_TITLE_MAX_LENGTH,
    )
    task_date: date | None = None
    start_time: time | None = None
    end_time: time | None = None
    is_completed: bool | None = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, title: str | None) -> str:
        if title is None:
            raise ValueError("Title cannot be null.")
        return normalize_title(title)

    @field_validator("task_date", "is_completed")
    @classmethod
    def reject_null_updates(cls, value: Any) -> Any:
        if value is None:
            raise ValueError("Updated fields cannot be null.")
        return value

    @field_validator("start_time", "end_time")
    @classmethod
    def validate_updated_time(cls, value: time | None) -> time:
        if value is None:
            raise ValueError("Updated fields cannot be null.")
        return validate_local_time(value)

    @model_validator(mode="after")
    def validate_time_range(self) -> "PlannerTaskUpdate":
        if (
            self.start_time is not None
            and self.end_time is not None
            and self.end_time <= self.start_time
        ):
            raise ValueError("End time must be later than start time.")
        return self


class PlannerTaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    task_date: date
    start_time: time
    end_time: time
    is_completed: bool
    created_at: datetime
    updated_at: datetime
