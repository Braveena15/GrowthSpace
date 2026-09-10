from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_session
from app.models import PlannerTask, User
from app.routes.auth import get_current_user
from app.schemas.planner import (
    PlannerTaskCreate,
    PlannerTaskResponse,
    PlannerTaskUpdate,
)


router = APIRouter(prefix="/api/planner", tags=["weekly planner"])
MAX_TASK_RANGE_DAYS = 31


def get_owned_task(task_id: int, user_id: int, session: Session) -> PlannerTask:
    task = session.scalar(
        select(PlannerTask).where(
            PlannerTask.id == task_id,
            PlannerTask.user_id == user_id,
        )
    )
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Planner task not found.",
        )
    return task


@router.post(
    "/tasks",
    response_model=PlannerTaskResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task(
    task_data: PlannerTaskCreate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> PlannerTask:
    task = PlannerTask(user_id=user.id, **task_data.model_dump())
    session.add(task)
    session.commit()
    session.refresh(task)
    return task


@router.get("/tasks", response_model=list[PlannerTaskResponse])
def list_tasks(
    start_date: date,
    end_date: date,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> list[PlannerTask]:
    if end_date < start_date:
        raise HTTPException(
            status_code=422,
            detail="end_date must be on or after start_date.",
        )
    if (end_date - start_date).days + 1 > MAX_TASK_RANGE_DAYS:
        raise HTTPException(
            status_code=422,
            detail=f"Date range cannot exceed {MAX_TASK_RANGE_DAYS} days.",
        )

    return list(
        session.scalars(
            select(PlannerTask)
            .where(
                PlannerTask.user_id == user.id,
                PlannerTask.task_date >= start_date,
                PlannerTask.task_date <= end_date,
            )
            .order_by(
                PlannerTask.task_date,
                PlannerTask.start_time,
                PlannerTask.id,
            )
        )
    )


@router.get("/tasks/{task_id}", response_model=PlannerTaskResponse)
def get_task(
    task_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> PlannerTask:
    return get_owned_task(task_id, user.id, session)


@router.patch("/tasks/{task_id}", response_model=PlannerTaskResponse)
def update_task(
    task_id: int,
    task_data: PlannerTaskUpdate,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> PlannerTask:
    task = get_owned_task(task_id, user.id, session)
    updates = task_data.model_dump(exclude_unset=True)
    next_start_time = updates.get("start_time", task.start_time)
    next_end_time = updates.get("end_time", task.end_time)
    if next_end_time <= next_start_time:
        raise HTTPException(
            status_code=422,
            detail="End time must be later than start time.",
        )

    for field, value in updates.items():
        setattr(task, field, value)

    session.commit()
    session.refresh(task)
    return task


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Response:
    task = get_owned_task(task_id, user.id, session)
    session.delete(task)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
