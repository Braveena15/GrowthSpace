from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import User
from app.routes.auth import get_current_user
from app.schemas.report import MonthlyProgressResponse, WeeklyReportResponse
from app.services.monthly_progress import build_monthly_progress
from app.services.progress_cycles import cycle_for_date, is_cycle_boundary
from app.services.weekly_report import build_weekly_report


router = APIRouter(prefix="/api/reports", tags=["weekly reports"])


@router.get("/weekly", response_model=WeeklyReportResponse)
def weekly_report(
    week_start: date,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> WeeklyReportResponse:
    if week_start.weekday() != 0:
        raise HTTPException(status_code=422, detail="week_start must be a Monday.")
    try:
        return build_weekly_report(session, user.id, week_start)
    except SQLAlchemyError:
        raise HTTPException(
            status_code=503,
            detail="Weekly report is temporarily unavailable.",
        ) from None


@router.get("/monthly", response_model=MonthlyProgressResponse)
def monthly_progress(
    period_start: date | None = None,
    user: Annotated[User, Depends(get_current_user)] = None,
    session: Annotated[Session, Depends(get_session)] = None,
) -> MonthlyProgressResponse:
    if user.tracking_started_on is None:
        raise HTTPException(status_code=409, detail="Monthly progress begins after the first saved check-in response.")
    _, current_start, _ = cycle_for_date(user.tracking_started_on, date.today())
    selected_start = current_start if period_start is None else period_start
    if selected_start < user.tracking_started_on or not is_cycle_boundary(user.tracking_started_on, selected_start):
        raise HTTPException(status_code=422, detail="period_start must be a progress cycle boundary.")
    offset, _, _ = cycle_for_date(user.tracking_started_on, selected_start)
    try:
        return build_monthly_progress(session, user.id, user.tracking_started_on, offset)
    except SQLAlchemyError:
        raise HTTPException(status_code=503, detail="Monthly progress is temporarily unavailable.") from None
