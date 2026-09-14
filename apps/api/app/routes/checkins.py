from datetime import date, datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.checkin_definitions import CATEGORY_ORDER, QUESTION_BY_KEY, QUESTION_SET_VERSION, questions_for_date
from app.database import get_session
from app.models import CheckInAnswer, CheckInCategoryNote, CheckInNap, CheckInResponsibility, DailyCheckIn, User
from app.routes.auth import get_current_user
from app.schemas.checkin import (
    AnswerResponse,
    AnswerWrite,
    CheckInResponse,
    NapListWrite,
    NapResponse,
    NoteResponse,
    NoteWrite,
    QuestionResponse,
    QuestionSetResponse,
    ResponsibilityListWrite,
    ResponsibilityResponse,
)

router = APIRouter(prefix="/api/check-ins", tags=["daily check-ins"])


def serialize(check_in: DailyCheckIn, session: Session) -> CheckInResponse:
    answers = list(session.scalars(select(CheckInAnswer).where(CheckInAnswer.check_in_id == check_in.id).order_by(CheckInAnswer.id)))
    notes = list(session.scalars(select(CheckInCategoryNote).where(CheckInCategoryNote.check_in_id == check_in.id).order_by(CheckInCategoryNote.id)))
    naps = list(session.scalars(select(CheckInNap).where(CheckInNap.check_in_id == check_in.id).order_by(CheckInNap.position)))
    responsibilities = list(session.scalars(select(CheckInResponsibility).where(CheckInResponsibility.check_in_id == check_in.id).order_by(CheckInResponsibility.position)))
    total_nap_minutes = sum(nap.duration_minutes for nap in naps)
    night_sleep = next((answer.numeric_value for answer in answers if answer.question_key == "P1M"), None)
    return CheckInResponse(
        id=check_in.id,
        local_date=check_in.local_date,
        question_set_version=check_in.question_set_version,
        status=check_in.status,
        created_at=check_in.created_at,
        updated_at=check_in.updated_at,
        submitted_at=check_in.submitted_at,
        answers=[AnswerResponse(question_key=a.question_key, numeric_value=a.numeric_value, choice_value=a.choice_value) for a in answers],
        notes=[NoteResponse(category=n.category, note=n.note) for n in notes],
        naps=[NapResponse(position=n.position, duration_minutes=n.duration_minutes) for n in naps],
        responsibilities=[ResponsibilityResponse(position=r.position, description=r.description) for r in responsibilities],
        total_nap_minutes=total_nap_minutes,
        total_daily_sleep_minutes=None if night_sleep is None else int(night_sleep) + total_nap_minutes,
        responsibility_count=len(responsibilities),
    )


def owned(local_date: date, user: User, session: Session) -> DailyCheckIn:
    check_in = session.scalar(select(DailyCheckIn).where(DailyCheckIn.user_id == user.id, DailyCheckIn.local_date == local_date))
    if check_in is None:
        raise HTTPException(404, "Check-in not found.")
    return check_in


def editable(check_in: DailyCheckIn) -> None:
    if check_in.status == "submitted" and check_in.local_date != date.today():
        raise HTTPException(409, "Submitted check-ins can only be edited on their local date.")


def choice_answer(session: Session, check_in_id: int, question_key: str) -> str | None:
    return session.scalar(select(CheckInAnswer.choice_value).where(CheckInAnswer.check_in_id == check_in_id, CheckInAnswer.question_key == question_key))


@router.get("/questions", response_model=QuestionSetResponse)
def get_questions(local_date: date, user: Annotated[User, Depends(get_current_user)]) -> QuestionSetResponse:
    del user
    return QuestionSetResponse(
        local_date=local_date,
        version=QUESTION_SET_VERSION,
        questions=[QuestionResponse(key=q.key, category=q.category, subcategory=q.subcategory, text=q.text, kind=q.kind, required=q.required, minimum=q.minimum, maximum=q.maximum, choices=list(q.choices), scale_labels=list(q.scale_labels)) for q in questions_for_date(local_date)],
    )


@router.put("/{local_date}", response_model=CheckInResponse)
def create_or_get(local_date: date, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = session.scalar(select(DailyCheckIn).where(DailyCheckIn.user_id == user.id, DailyCheckIn.local_date == local_date))
    if check_in is None:
        check_in = DailyCheckIn(user_id=user.id, local_date=local_date, question_set_version=QUESTION_SET_VERSION)
        session.add(check_in)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            check_in = owned(local_date, user, session)
        else:
            session.refresh(check_in)
    elif check_in.status == "draft" and check_in.question_set_version != QUESTION_SET_VERSION:
        # A draft can adopt the new questions without changing legacy answer units.
        check_in.question_set_version = QUESTION_SET_VERSION
        session.commit()
        session.refresh(check_in)
    return serialize(check_in, session)


@router.get("/{local_date}", response_model=CheckInResponse)
def get_check_in(local_date: date, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    return serialize(owned(local_date, user, session), session)


@router.put("/{local_date}/answers", response_model=CheckInResponse)
def save_answer(local_date: date, answer: AnswerWrite, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = owned(local_date, user, session)
    editable(check_in)
    question = QUESTION_BY_KEY.get(answer.question_key)
    if question is None or question not in questions_for_date(local_date):
        raise HTTPException(422, "Question is not available for this date.")

    if question.kind in {"integer", "number", "duration", "rating"}:
        numeric_is_valid = (
            answer.numeric_value is not None
            and answer.choice_value is None
            and question.minimum is not None
            and question.maximum is not None
            and question.minimum <= answer.numeric_value <= question.maximum
            and (question.kind == "number" or answer.numeric_value.is_integer())
        )
        allowed_non_numeric_choice = answer.choice_value in question.choices and answer.numeric_value is None
        if not numeric_is_valid and not allowed_non_numeric_choice:
            raise HTTPException(422, "Answer is not valid for this question.")
    elif answer.choice_value not in question.choices or answer.numeric_value is not None:
        raise HTTPException(422, "Answer is not valid for this question.")

    if answer.question_key == "P1M" and answer.numeric_value is not None:
        all_nap_minutes = sum(
            session.scalars(
                select(CheckInNap.duration_minutes).where(
                    CheckInNap.check_in_id == check_in.id
                )
            )
        )
        if answer.numeric_value + all_nap_minutes > 1440:
            raise HTTPException(422, "Total daily sleep cannot exceed 24 hours.")

    stored = session.scalar(select(CheckInAnswer).where(CheckInAnswer.check_in_id == check_in.id, CheckInAnswer.question_key == answer.question_key))
    if stored is None:
        stored = CheckInAnswer(check_in_id=check_in.id, **answer.model_dump())
        session.add(stored)
    else:
        stored.numeric_value = answer.numeric_value
        stored.choice_value = answer.choice_value

    if answer.question_key == "P3" and answer.choice_value == "No":
        session.execute(delete(CheckInNap).where(CheckInNap.check_in_id == check_in.id))
    if answer.question_key == "I1" and answer.choice_value in {"No", "N/A"}:
        session.execute(delete(CheckInResponsibility).where(CheckInResponsibility.check_in_id == check_in.id))
    # This is a durable reporting anchor: only a validated saved response may set it.
    if user.tracking_started_on is None:
        user.tracking_started_on = local_date
    session.commit()
    session.refresh(check_in)
    return serialize(check_in, session)


@router.delete("/{local_date}/answers/{question_key}", response_model=CheckInResponse)
def clear_answer(local_date: date, question_key: str, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = owned(local_date, user, session)
    editable(check_in)
    if question_key not in {question.key for question in questions_for_date(local_date)}:
        raise HTTPException(422, "Question is not available for this date.")
    session.execute(delete(CheckInAnswer).where(CheckInAnswer.check_in_id == check_in.id, CheckInAnswer.question_key == question_key))
    if question_key == "P3":
        session.execute(delete(CheckInNap).where(CheckInNap.check_in_id == check_in.id))
    if question_key == "I1":
        session.execute(delete(CheckInResponsibility).where(CheckInResponsibility.check_in_id == check_in.id))
    session.commit()
    session.refresh(check_in)
    return serialize(check_in, session)


@router.put("/{local_date}/notes", response_model=CheckInResponse)
def save_note(local_date: date, payload: NoteWrite, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = owned(local_date, user, session)
    editable(check_in)
    if payload.category not in CATEGORY_ORDER:
        raise HTTPException(422, "Category is not valid.")
    note = session.scalar(select(CheckInCategoryNote).where(CheckInCategoryNote.check_in_id == check_in.id, CheckInCategoryNote.category == payload.category))
    if note is None:
        session.add(CheckInCategoryNote(check_in_id=check_in.id, **payload.model_dump()))
    else:
        note.note = payload.note
    session.commit()
    session.refresh(check_in)
    return serialize(check_in, session)


@router.put("/{local_date}/naps", response_model=CheckInResponse)
def replace_naps(local_date: date, payload: NapListWrite, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = owned(local_date, user, session)
    editable(check_in)
    if choice_answer(session, check_in.id, "P3") != "Yes":
        raise HTTPException(422, "Daytime sleep must be Yes before adding naps.")
    night_sleep = session.scalar(select(CheckInAnswer.numeric_value).where(CheckInAnswer.check_in_id == check_in.id, CheckInAnswer.question_key == "P1M")) or 0
    if night_sleep + sum(payload.durations_minutes) > 1440:
        raise HTTPException(422, "Total daily sleep cannot exceed 24 hours.")
    session.execute(delete(CheckInNap).where(CheckInNap.check_in_id == check_in.id))
    session.add_all([CheckInNap(check_in_id=check_in.id, position=index, duration_minutes=duration) for index, duration in enumerate(payload.durations_minutes, 1)])
    session.commit()
    session.refresh(check_in)
    return serialize(check_in, session)


@router.put("/{local_date}/responsibilities", response_model=CheckInResponse)
def replace_responsibilities(local_date: date, payload: ResponsibilityListWrite, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = owned(local_date, user, session)
    editable(check_in)
    if choice_answer(session, check_in.id, "I1") != "Yes":
        raise HTTPException(422, "Responsibility answer must be Yes before adding items.")
    session.execute(delete(CheckInResponsibility).where(CheckInResponsibility.check_in_id == check_in.id))
    session.add_all([CheckInResponsibility(check_in_id=check_in.id, position=index, description=description) for index, description in enumerate(payload.items, 1)])
    session.commit()
    session.refresh(check_in)
    return serialize(check_in, session)


@router.post("/{local_date}/submit", response_model=CheckInResponse)
def submit(local_date: date, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> CheckInResponse:
    check_in = owned(local_date, user, session)
    if check_in.status == "submitted":
        return serialize(check_in, session)
    answers = list(session.scalars(select(CheckInAnswer).where(CheckInAnswer.check_in_id == check_in.id)))
    answer_by_key = {answer.question_key: answer for answer in answers}
    missing = [question.key for question in questions_for_date(local_date) if question.required and question.key not in answer_by_key]
    if missing:
        raise HTTPException(422, "Complete all required questions before submitting.")
    if answer_by_key["P3"].choice_value == "Yes" and session.scalar(select(CheckInNap.id).where(CheckInNap.check_in_id == check_in.id).limit(1)) is None:
        raise HTTPException(422, "Add at least one daytime nap before submitting.")
    if answer_by_key["I1"].choice_value == "Yes" and session.scalar(select(CheckInResponsibility.id).where(CheckInResponsibility.check_in_id == check_in.id).limit(1)) is None:
        raise HTTPException(422, "Add at least one completed responsibility before submitting.")
    check_in.status = "submitted"
    check_in.submitted_at = datetime.now(timezone.utc)
    session.commit()
    session.refresh(check_in)
    return serialize(check_in, session)
