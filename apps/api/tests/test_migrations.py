from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, inspect


API_ROOT = Path(__file__).resolve().parents[1]


def test_migrations_upgrade_and_downgrade_test_database() -> None:
    engine = create_engine("sqlite://")
    config = Config(str(API_ROOT / "alembic.ini"))

    with engine.connect() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")

        upgraded = inspect(connection)
        assert "users" in upgraded.get_table_names()
        assert "planner_tasks" in upgraded.get_table_names()
        assert "daily_check_ins" in upgraded.get_table_names()
        assert "check_in_answers" in upgraded.get_table_names()
        assert "check_in_category_notes" in upgraded.get_table_names()
        assert "check_in_naps" in upgraded.get_table_names()
        assert "check_in_responsibilities" in upgraded.get_table_names()
        assert "daily_note_analyses" in upgraded.get_table_names()
        assert "journal_entries" in upgraded.get_table_names()
        assert "question_set_version" in {
            column["name"] for column in upgraded.get_columns("daily_check_ins")
        }
        indexes = {
            index["name"]: index["column_names"]
            for index in upgraded.get_indexes("planner_tasks")
        }
        assert indexes["ix_planner_tasks_user_id_task_date"] == [
            "user_id",
            "task_date",
        ]

        command.downgrade(config, "20260910_0001")

        downgraded = inspect(connection)
        assert "users" in downgraded.get_table_names()
        assert "planner_tasks" not in downgraded.get_table_names()
        assert "daily_check_ins" not in downgraded.get_table_names()

    engine.dispose()
