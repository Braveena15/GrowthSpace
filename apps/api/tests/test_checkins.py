from collections.abc import Generator
from dataclasses import dataclass
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import CheckInNap, CheckInResponsibility, DailyCheckIn, User
from app.security import create_access_token


JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"
MONDAY = date(2026, 9, 14)


@dataclass
class CheckInTestContext:
    client: TestClient
    engine: Engine
    headers: dict[str, str]
    other_headers: dict[str, str]


@pytest.fixture
def checkin_context() -> Generator[CheckInTestContext, None, None]:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(engine, "connect")
    def enable_sqlite_foreign_keys(dbapi_connection: object, connection_record: object) -> None:
        del connection_record
        cursor = dbapi_connection.cursor()  # type: ignore[attr-defined]
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base = DailyCheckIn.metadata
    Base.create_all(engine)
    with Session(engine) as session:
        owner = User(username="checkin_owner", password_hash="unused")
        other = User(username="other_owner", password_hash="unused")
        session.add_all([owner, other])
        session.commit()
        session.refresh(owner)
        session.refresh(other)
        owner_token = create_access_token(owner.id, JWT_SECRET, 30)
        other_token = create_access_token(other.id, JWT_SECRET, 30)

    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret=JWT_SECRET,
        access_token_expire_minutes=30,
        _env_file=None,
    )

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        yield CheckInTestContext(
            client,
            engine,
            {"Authorization": f"Bearer {owner_token}"},
            {"Authorization": f"Bearer {other_token}"},
        )
    app.dependency_overrides.clear()
    engine.dispose()


def open_checkin(context: CheckInTestContext, day: date = MONDAY) -> None:
    response = context.client.put(f"/api/check-ins/{day.isoformat()}", headers=context.headers)
    assert response.status_code == 200


def save_choice(context: CheckInTestContext, key: str, value: str, day: date = MONDAY) -> None:
    response = context.client.put(
        f"/api/check-ins/{day.isoformat()}/answers",
        headers=context.headers,
        json={"question_key": key, "numeric_value": None, "choice_value": value},
    )
    assert response.status_code == 200


def complete_required_answers(context: CheckInTestContext, responsibility_value: str = "No") -> None:
    questions = context.client.get(
        "/api/check-ins/questions",
        params={"local_date": MONDAY},
        headers=context.headers,
    ).json()["questions"]
    for question in questions:
        if question["kind"] == "choice":
            value = responsibility_value if question["key"] == "I1" else "No"
            payload = {"question_key": question["key"], "numeric_value": None, "choice_value": value}
        else:
            value = 3 if question["kind"] == "rating" else 0
            payload = {"question_key": question["key"], "numeric_value": value, "choice_value": None}
        response = context.client.put(
            f"/api/check-ins/{MONDAY}/answers",
            headers=context.headers,
            json=payload,
        )
        assert response.status_code == 200


def test_checkin_endpoints_require_authentication(checkin_context: CheckInTestContext) -> None:
    assert checkin_context.client.get("/api/check-ins/questions", params={"local_date": MONDAY}).status_code == 401
    assert checkin_context.client.put(f"/api/check-ins/{MONDAY}").status_code == 401


@pytest.mark.parametrize(
    ("offset", "scheduled_key"),
    [(0, "SC2"), (1, "SC3"), (2, "SC2"), (3, "SC3"), (4, None), (5, None), (6, None)],
)
def test_scheduled_care_for_every_local_weekday(checkin_context: CheckInTestContext, offset: int, scheduled_key: str | None) -> None:
    local_day = MONDAY + timedelta(days=offset)
    response = checkin_context.client.get("/api/check-ins/questions", params={"local_date": local_day}, headers=checkin_context.headers)
    assert response.status_code == 200
    keys = {question["key"] for question in response.json()["questions"]}
    assert "SC1" in keys
    assert ("SC2" in keys) == (scheduled_key == "SC2")
    assert ("SC3" in keys) == (scheduled_key == "SC3")


def test_duration_minutes_support_zero_clear_and_maximum_validation(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    zero = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/answers",
        headers=checkin_context.headers,
        json={"question_key": "P2", "numeric_value": 0, "choice_value": None},
    )
    too_large = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/answers",
        headers=checkin_context.headers,
        json={"question_key": "P2", "numeric_value": 601, "choice_value": None},
    )
    cleared = checkin_context.client.delete(f"/api/check-ins/{MONDAY}/answers/P2", headers=checkin_context.headers)

    assert zero.status_code == 200
    assert next(answer for answer in zero.json()["answers"] if answer["question_key"] == "P2")["numeric_value"] == 0
    assert too_large.status_code == 422
    assert all(answer["question_key"] != "P2" for answer in cleared.json()["answers"])


def test_night_sleep_and_multiple_naps_are_totalled_in_minutes(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    night = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/answers",
        headers=checkin_context.headers,
        json={"question_key": "P1M", "numeric_value": 450, "choice_value": None},
    )
    save_choice(checkin_context, "P3", "Yes")
    naps = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/naps",
        headers=checkin_context.headers,
        json={"durations_minutes": [25, 60]},
    )

    assert night.status_code == 200
    assert naps.status_code == 200
    assert [nap["duration_minutes"] for nap in naps.json()["naps"]] == [25, 60]
    assert naps.json()["total_nap_minutes"] == 85
    assert naps.json()["total_daily_sleep_minutes"] == 535


def test_zero_length_nap_is_rejected_and_no_path_clears_naps(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    save_choice(checkin_context, "P3", "Yes")
    invalid = checkin_context.client.put(f"/api/check-ins/{MONDAY}/naps", headers=checkin_context.headers, json={"durations_minutes": [0]})
    assert invalid.status_code == 422

    saved = checkin_context.client.put(f"/api/check-ins/{MONDAY}/naps", headers=checkin_context.headers, json={"durations_minutes": [30]})
    assert saved.status_code == 200
    save_choice(checkin_context, "P3", "No")
    current = checkin_context.client.get(f"/api/check-ins/{MONDAY}", headers=checkin_context.headers)
    assert current.json()["naps"] == []


def test_naps_are_isolated_by_authenticated_owner(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    save_choice(checkin_context, "P3", "Yes")
    checkin_context.client.put(f"/api/check-ins/{MONDAY}/naps", headers=checkin_context.headers, json={"durations_minutes": [30]})

    other_write = checkin_context.client.put(f"/api/check-ins/{MONDAY}/naps", headers=checkin_context.other_headers, json={"durations_minutes": [90]})
    assert other_write.status_code == 404
    current = checkin_context.client.get(f"/api/check-ins/{MONDAY}", headers=checkin_context.headers)
    assert current.json()["total_nap_minutes"] == 30


def test_answers_are_isolated_by_authenticated_owner(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    other_write = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/answers",
        headers=checkin_context.other_headers,
        json={"question_key": "M1", "numeric_value": 5, "choice_value": None},
    )
    assert other_write.status_code == 404
    current = checkin_context.client.get(f"/api/check-ins/{MONDAY}", headers=checkin_context.headers)
    assert current.json()["answers"] == []


def test_responsibility_yes_requires_items_and_counts_multiple(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    save_choice(checkin_context, "I1", "Yes")
    saved = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/responsibilities",
        headers=checkin_context.headers,
        json={"items": ["Prepared dinner", "Completed paperwork"]},
    )
    assert saved.status_code == 200
    assert saved.json()["responsibility_count"] == 2
    assert [item["description"] for item in saved.json()["responsibilities"]] == ["Prepared dinner", "Completed paperwork"]


def test_responsibility_yes_blocks_submission_until_an_item_exists(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    complete_required_answers(checkin_context, responsibility_value="Yes")
    missing = checkin_context.client.post(f"/api/check-ins/{MONDAY}/submit", headers=checkin_context.headers)
    assert missing.status_code == 422
    assert missing.json() == {"detail": "Add at least one completed responsibility before submitting."}

    saved = checkin_context.client.put(
        f"/api/check-ins/{MONDAY}/responsibilities",
        headers=checkin_context.headers,
        json={"items": ["Completed an application"]},
    )
    assert saved.status_code == 200
    submitted = checkin_context.client.post(f"/api/check-ins/{MONDAY}/submit", headers=checkin_context.headers)
    assert submitted.status_code == 200
    assert submitted.json()["status"] == "submitted"


@pytest.mark.parametrize("answer", ["No", "N/A"])
def test_no_or_na_clears_contradictory_responsibilities(checkin_context: CheckInTestContext, answer: str) -> None:
    open_checkin(checkin_context)
    save_choice(checkin_context, "I1", "Yes")
    checkin_context.client.put(f"/api/check-ins/{MONDAY}/responsibilities", headers=checkin_context.headers, json={"items": ["Paid a bill"]})
    save_choice(checkin_context, "I1", answer)
    current = checkin_context.client.get(f"/api/check-ins/{MONDAY}", headers=checkin_context.headers)
    assert current.json()["responsibilities"] == []
    with Session(checkin_context.engine) as session:
        assert session.scalar(select(func.count()).select_from(CheckInResponsibility)) == 0


def test_responsibility_validation_and_ownership(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    save_choice(checkin_context, "I1", "Yes")
    blank = checkin_context.client.put(f"/api/check-ins/{MONDAY}/responsibilities", headers=checkin_context.headers, json={"items": ["   "]})
    too_long = checkin_context.client.put(f"/api/check-ins/{MONDAY}/responsibilities", headers=checkin_context.headers, json={"items": ["x" * 201]})
    other = checkin_context.client.put(f"/api/check-ins/{MONDAY}/responsibilities", headers=checkin_context.other_headers, json={"items": ["Not mine"]})
    assert blank.status_code == 422
    assert too_long.status_code == 422
    assert other.status_code == 404


def test_note_rejects_unexpected_fields_and_over_2000_characters(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    payload = {"category": "Career", "note": "x" * 2001}
    assert checkin_context.client.put(f"/api/check-ins/{MONDAY}/notes", headers=checkin_context.headers, json=payload).status_code == 422
    payload = {"category": "Career", "note": "Safe note", "analysis": "not accepted"}
    assert checkin_context.client.put(f"/api/check-ins/{MONDAY}/notes", headers=checkin_context.headers, json=payload).status_code == 422


def test_question_set_version_preserves_legacy_unit_meaning(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    with Session(checkin_context.engine) as session:
        check_in = session.scalar(select(DailyCheckIn))
        assert check_in is not None
        assert check_in.question_set_version == "2026-09-13-v2"
    questions = checkin_context.client.get("/api/check-ins/questions", params={"local_date": MONDAY}, headers=checkin_context.headers).json()
    assert "P1M" in {question["key"] for question in questions["questions"]}
    assert "P1" not in {question["key"] for question in questions["questions"]}


def test_normalized_rows_are_deleted_with_the_checkin(checkin_context: CheckInTestContext) -> None:
    open_checkin(checkin_context)
    save_choice(checkin_context, "P3", "Yes")
    save_choice(checkin_context, "I1", "Yes")
    checkin_context.client.put(f"/api/check-ins/{MONDAY}/naps", headers=checkin_context.headers, json={"durations_minutes": [20]})
    checkin_context.client.put(f"/api/check-ins/{MONDAY}/responsibilities", headers=checkin_context.headers, json={"items": ["One item"]})
    with Session(checkin_context.engine) as session:
        check_in = session.scalar(select(DailyCheckIn))
        session.delete(check_in)
        session.commit()
        assert session.scalar(select(func.count()).select_from(CheckInNap)) == 0
        assert session.scalar(select(func.count()).select_from(CheckInResponsibility)) == 0
