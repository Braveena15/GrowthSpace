from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import User
from app.routes.auth import get_current_user
from app.schemas.report import WeeklyReportResponse
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
