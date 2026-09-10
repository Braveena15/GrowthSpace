from datetime import date, datetime, time

from sqlalchemy import DateTime, Time

from app.models import PlannerTask


def test_planner_task_model_has_expected_schema() -> None:
    table = PlannerTask.__table__

    assert table.primary_key.columns.keys() == ["id"]
    assert table.c.user_id.nullable is False
    assert table.c.title.nullable is False
    assert table.c.title.type.length == 200
    assert table.c.task_date.nullable is False
    assert table.c.start_time.nullable is False
    assert table.c.end_time.nullable is False
    assert isinstance(table.c.start_time.type, Time)
    assert table.c.start_time.type.timezone is False
    assert table.c.is_completed.default is not None
    assert table.c.is_completed.server_default is not None
    assert isinstance(table.c.created_at.type, DateTime)
    assert table.c.created_at.type.timezone is True
    assert isinstance(table.c.updated_at.type, DateTime)
    assert table.c.updated_at.type.timezone is True
    assert table.c.updated_at.onupdate is not None


def test_planner_task_has_cascading_user_foreign_key_and_date_index() -> None:
    table = PlannerTask.__table__
    foreign_key = next(iter(table.c.user_id.foreign_keys))
    indexes = {index.name: [column.name for column in index.columns] for index in table.indexes}

    assert foreign_key.target_fullname == "users.id"
    assert foreign_key.ondelete == "CASCADE"
    assert indexes["ix_planner_tasks_user_id_task_date"] == ["user_id", "task_date"]


def test_planner_task_accepts_python_date_and_time_types() -> None:
    task = PlannerTask(
        user_id=1,
        title="Focus block",
        task_date=date(2026, 9, 14),
        start_time=time(9, 0),
        end_time=time(10, 0),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )

    assert task.task_date == date(2026, 9, 14)
    assert task.start_time == time(9, 0)
    assert task.end_time == time(10, 0)
