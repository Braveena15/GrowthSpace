from collections.abc import Generator
from datetime import datetime

import pytest
from sqlalchemy import DateTime, create_engine, inspect
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import Base, User


@pytest.fixture
def session() -> Generator[Session, None, None]:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    with Session(engine) as database_session:
        yield database_session

    engine.dispose()


def test_user_model_has_expected_schema() -> None:
    table = User.__table__

    assert table.primary_key.columns.keys() == ["id"]
    assert table.c.username.nullable is False
    assert table.c.username.unique is True
    assert table.c.password_hash.nullable is False
    assert table.c.is_active.nullable is False
    assert table.c.is_active.default is not None
    assert table.c.is_active.server_default is not None
    assert table.c.created_at.nullable is False
    assert isinstance(table.c.created_at.type, DateTime)
    assert table.c.created_at.type.timezone is True


def test_user_defaults_are_applied(session: Session) -> None:
    user = User(username="ada", password_hash="stored-hash")

    session.add(user)
    session.commit()
    session.refresh(user)

    assert user.id is not None
    assert user.is_active is True
    assert isinstance(user.created_at, datetime)


def test_username_must_be_unique(session: Session) -> None:
    session.add(User(username="ada", password_hash="first-hash"))
    session.commit()
    session.add(User(username="ada", password_hash="second-hash"))

    with pytest.raises(IntegrityError):
        session.commit()


def test_users_table_contains_no_plain_text_password_column() -> None:
    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)

    column_names = {column["name"] for column in inspect(engine).get_columns("users")}

    engine.dispose()
    assert "password_hash" in column_names
    assert "password" not in column_names
