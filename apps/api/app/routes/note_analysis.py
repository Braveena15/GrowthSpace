from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_session
from app.models import CheckInCategoryNote, DailyCheckIn, DailyNoteAnalysis, User
from app.routes.auth import get_current_user
from app.schemas.note_analysis import (
    GenerateNoteAnalysisRequest,
    NoteAnalysisContent,
    NoteAnalysisResponse,
    NoteAnalysisStateResponse,
)
from app.services.note_analysis import (
    PROMPT_VERSION,
    NoteAnalysisMalformedResponseError,
    NoteAnalysisProvider,
    NoteAnalysisSchemaError,
    NoteAnalysisTimeoutError,
    NoteAnalysisUnavailableError,
    NoteSource,
    get_note_analysis_provider,
    normalize_sources,
    source_fingerprint,
)


router = APIRouter(prefix="/api/check-ins", tags=["AI note analysis"])


def owned_check_in(local_date: date, user: User, session: Session) -> DailyCheckIn:
    check_in = session.scalar(
        select(DailyCheckIn).where(
            DailyCheckIn.user_id == user.id,
            DailyCheckIn.local_date == local_date,
        )
    )
    if check_in is None:
        raise HTTPException(404, "Check-in not found.")
    return check_in


def get_sources(check_in: DailyCheckIn, session: Session) -> list[NoteSource]:
    category_notes = session.execute(
        select(CheckInCategoryNote.category, CheckInCategoryNote.note).where(
            CheckInCategoryNote.check_in_id == check_in.id
        )
    ).all()
    return normalize_sources([(category, note) for category, note in category_notes])


def get_owned_analysis(check_in: DailyCheckIn, user: User, session: Session) -> DailyNoteAnalysis | None:
    return session.scalar(
        select(DailyNoteAnalysis).where(
            DailyNoteAnalysis.check_in_id == check_in.id,
            DailyNoteAnalysis.user_id == user.id,
            DailyNoteAnalysis.local_date == check_in.local_date,
        )
    )


def require_owned_analysis(check_in: DailyCheckIn, user: User, session: Session) -> DailyNoteAnalysis:
    analysis = get_owned_analysis(check_in, user, session)
    if analysis is None:
        raise HTTPException(404, "Note analysis not found.")
    return analysis


def serialize(analysis: DailyNoteAnalysis) -> NoteAnalysisResponse:
    return NoteAnalysisResponse(
        id=analysis.id,
        local_date=analysis.local_date,
        summary=analysis.summary,
        positive_actions=analysis.positive_actions,
        challenges=analysis.challenges,
        possible_improvements=analysis.possible_improvements,
        themes=analysis.themes,
        reflection_question=analysis.reflection_question,
        status=analysis.status,
        model_name=analysis.model_name,
        prompt_version=analysis.prompt_version,
        created_at=analysis.created_at,
        updated_at=analysis.updated_at,
    )


def build_state(check_in: DailyCheckIn, user: User, session: Session, enabled: bool) -> NoteAnalysisStateResponse:
    sources = get_sources(check_in, session)
    analysis = get_owned_analysis(check_in, user, session)
    return NoteAnalysisStateResponse(
        enabled=enabled,
        has_notes=bool(sources),
        is_outdated=analysis is not None and analysis.source_fingerprint != source_fingerprint(sources),
        analysis=None if analysis is None else serialize(analysis),
    )


@router.get("/{local_date}/note-analysis", response_model=NoteAnalysisStateResponse)
def get_analysis(
    local_date: date,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> NoteAnalysisStateResponse:
    check_in = owned_check_in(local_date, user, session)
    return build_state(check_in, user, session, settings.ai_note_analysis_enabled)


@router.post("/{local_date}/note-analysis", response_model=NoteAnalysisStateResponse)
def generate_analysis(
    local_date: date,
    payload: GenerateNoteAnalysisRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
    provider: Annotated[NoteAnalysisProvider, Depends(get_note_analysis_provider)],
) -> NoteAnalysisStateResponse:
    if not settings.ai_note_analysis_enabled:
        raise HTTPException(503, "AI note analysis is currently disabled.")
    check_in = owned_check_in(local_date, user, session)
    sources = get_sources(check_in, session)
    if not sources:
        raise HTTPException(422, "Add at least one note before requesting an analysis.")
    existing = get_owned_analysis(check_in, user, session)
    if existing is not None and existing.status == "accepted" and not payload.confirm_overwrite_accepted:
        raise HTTPException(409, "Confirm reanalysis before replacing an accepted analysis.")

    try:
        content = NoteAnalysisContent.model_validate(provider.analyse(sources))
    except NoteAnalysisTimeoutError:
        raise HTTPException(504, "AI note analysis timed out. Please try again.") from None
    except NoteAnalysisUnavailableError:
        raise HTTPException(503, "AI note analysis is temporarily unavailable.") from None
    except (NoteAnalysisMalformedResponseError, NoteAnalysisSchemaError, ValidationError):
        raise HTTPException(502, "AI note analysis returned an invalid response. Please try again.") from None

    values = content.model_dump()
    if existing is None:
        existing = DailyNoteAnalysis(
            user_id=user.id,
            check_in_id=check_in.id,
            local_date=local_date,
            status="draft",
            model_name=provider.model_name,
            prompt_version=PROMPT_VERSION,
            source_fingerprint=source_fingerprint(sources),
            **values,
        )
        session.add(existing)
    else:
        for field, value in values.items():
            setattr(existing, field, value)
        existing.status = "draft"
        existing.model_name = provider.model_name
        existing.prompt_version = PROMPT_VERSION
        existing.source_fingerprint = source_fingerprint(sources)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(409, "Analysis changed during generation. Please try again.") from None
    session.refresh(existing)
    return build_state(check_in, user, session, True)


@router.put("/{local_date}/note-analysis", response_model=NoteAnalysisStateResponse)
def edit_analysis(
    local_date: date,
    content: NoteAnalysisContent,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> NoteAnalysisStateResponse:
    check_in = owned_check_in(local_date, user, session)
    analysis = require_owned_analysis(check_in, user, session)
    for field, value in content.model_dump().items():
        setattr(analysis, field, value)
    analysis.status = "draft"
    session.commit()
    session.refresh(analysis)
    return build_state(check_in, user, session, settings.ai_note_analysis_enabled)


@router.post("/{local_date}/note-analysis/accept", response_model=NoteAnalysisStateResponse)
def accept_analysis(
    local_date: date,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> NoteAnalysisStateResponse:
    check_in = owned_check_in(local_date, user, session)
    analysis = require_owned_analysis(check_in, user, session)
    if analysis.source_fingerprint != source_fingerprint(get_sources(check_in, session)):
        raise HTTPException(409, "Reanalyse after changing notes before accepting.")
    analysis.status = "accepted"
    session.commit()
    session.refresh(analysis)
    return build_state(check_in, user, session, settings.ai_note_analysis_enabled)


@router.post("/{local_date}/note-analysis/reject", response_model=NoteAnalysisStateResponse)
def reject_analysis(
    local_date: date,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> NoteAnalysisStateResponse:
    check_in = owned_check_in(local_date, user, session)
    analysis = require_owned_analysis(check_in, user, session)
    analysis.status = "rejected"
    session.commit()
    session.refresh(analysis)
    return build_state(check_in, user, session, settings.ai_note_analysis_enabled)
