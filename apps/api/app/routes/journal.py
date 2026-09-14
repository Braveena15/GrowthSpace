from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import JournalEntry, User
from app.routes.auth import get_current_user
from app.schemas.journal import JournalEntryCreate, JournalEntryListResponse, JournalEntryResponse, JournalEntryUpdate


router = APIRouter(prefix="/api/journal", tags=["journal"])
MAX_PAGE_SIZE = 100


def owned_entry(entry_id: int, user_id: int, session: Session) -> JournalEntry:
    entry = session.scalar(select(JournalEntry).where(JournalEntry.id == entry_id, JournalEntry.user_id == user_id))
    if entry is None:
        raise HTTPException(status_code=404, detail="Journal entry not found.")
    return entry


@router.post("/entries", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
def create_entry(payload: JournalEntryCreate, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> JournalEntry:
    try:
        entry = JournalEntry(user_id=user.id, **payload.model_dump())
        session.add(entry)
        session.commit()
        session.refresh(entry)
        return entry
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(status_code=503, detail="Journal is temporarily unavailable.") from None


@router.get("/entries", response_model=JournalEntryListResponse)
def list_entries(
    user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)],
    start_date: date | None = None, end_date: date | None = None, query: str | None = Query(default=None, max_length=200),
    offset: int = Query(default=0, ge=0), limit: int = Query(default=20, ge=1, le=MAX_PAGE_SIZE),
) -> JournalEntryListResponse:
    if start_date and end_date and end_date < start_date:
        raise HTTPException(status_code=422, detail="end_date must be on or after start_date.")
    filters = [JournalEntry.user_id == user.id]
    if start_date: filters.append(JournalEntry.entry_date >= start_date)
    if end_date: filters.append(JournalEntry.entry_date <= end_date)
    if query and query.strip():
        term = f"%{query.strip().lower()}%"
        filters.append(or_(func.lower(JournalEntry.title).like(term), func.lower(JournalEntry.content).like(term)))
    try:
        total = session.scalar(select(func.count()).select_from(JournalEntry).where(*filters)) or 0
        entries = list(session.scalars(select(JournalEntry).where(*filters).order_by(JournalEntry.entry_date.desc(), JournalEntry.entry_time.desc(), JournalEntry.id.desc()).offset(offset).limit(limit)))
        return JournalEntryListResponse(entries=entries, total=total, offset=offset, limit=limit)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Journal is temporarily unavailable.") from None


@router.get("/entries/{entry_id}", response_model=JournalEntryResponse)
def get_entry(entry_id: int, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> JournalEntry:
    return owned_entry(entry_id, user.id, session)


@router.patch("/entries/{entry_id}", response_model=JournalEntryResponse)
def update_entry(entry_id: int, payload: JournalEntryUpdate, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> JournalEntry:
    entry = owned_entry(entry_id, user.id, session)
    try:
        for field, value in payload.model_dump(exclude_unset=True).items(): setattr(entry, field, value)
        session.commit(); session.refresh(entry)
        return entry
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(status_code=503, detail="Journal is temporarily unavailable.") from None


@router.delete("/entries/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(entry_id: int, user: Annotated[User, Depends(get_current_user)], session: Annotated[Session, Depends(get_session)]) -> Response:
    entry = owned_entry(entry_id, user.id, session)
    try:
        session.delete(entry); session.commit()
        return Response(status_code=204)
    except SQLAlchemyError:
        session.rollback()
        raise HTTPException(status_code=503, detail="Journal is temporarily unavailable.") from None
