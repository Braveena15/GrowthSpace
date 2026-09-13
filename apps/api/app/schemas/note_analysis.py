from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


AnalysisListItem = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=400),
]


class NoteAnalysisContent(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    summary: str = Field(min_length=1, max_length=1200)
    positive_actions: list[AnalysisListItem] = Field(max_length=8)
    challenges: list[AnalysisListItem] = Field(max_length=8)
    possible_improvements: list[AnalysisListItem] = Field(max_length=8)
    themes: list[AnalysisListItem] = Field(max_length=8)
    reflection_question: str = Field(min_length=1, max_length=600)


class NoteAnalysisResponse(NoteAnalysisContent):
    id: int
    local_date: date
    status: Literal["draft", "accepted", "rejected"]
    model_name: str
    prompt_version: str
    created_at: datetime
    updated_at: datetime


class NoteAnalysisStateResponse(BaseModel):
    enabled: bool
    has_notes: bool
    is_outdated: bool
    analysis: NoteAnalysisResponse | None


class GenerateNoteAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    confirm_overwrite_accepted: bool = False
