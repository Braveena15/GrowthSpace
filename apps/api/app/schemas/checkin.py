from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator


class AnswerWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question_key: str = Field(min_length=1, max_length=16)
    numeric_value: float | None = None
    choice_value: str | None = Field(default=None, max_length=32)

    @model_validator(mode="after")
    def one_value(self) -> "AnswerWrite":
        if (self.numeric_value is None) == (self.choice_value is None):
            raise ValueError("Provide exactly one answer value.")
        return self


class NoteWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    category: str
    note: str = Field(max_length=2000)


class NapListWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    durations_minutes: list[Annotated[int, Field(gt=0, le=1440)]] = Field(max_length=10)


ResponsibilityText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]


class ResponsibilityListWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")
    items: list[ResponsibilityText] = Field(max_length=10)


class AnswerResponse(AnswerWrite):
    pass


class NoteResponse(NoteWrite):
    pass


class NapResponse(BaseModel):
    position: int
    duration_minutes: int


class ResponsibilityResponse(BaseModel):
    position: int
    description: str


class CheckInResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    local_date: date
    question_set_version: str
    status: Literal["draft", "submitted"]
    created_at: datetime
    updated_at: datetime
    submitted_at: datetime | None
    answers: list[AnswerResponse]
    notes: list[NoteResponse]
    naps: list[NapResponse]
    responsibilities: list[ResponsibilityResponse]
    total_nap_minutes: int
    total_daily_sleep_minutes: int | None
    responsibility_count: int


class QuestionResponse(BaseModel):
    key: str
    category: str
    subcategory: str
    text: str
    kind: Literal["rating", "duration", "integer", "number", "choice"]
    required: bool
    minimum: int | float | None
    maximum: int | float | None
    choices: list[str]
    scale_labels: list[str]


class QuestionSetResponse(BaseModel):
    local_date: date
    version: str
    questions: list[QuestionResponse]
