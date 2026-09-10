from collections.abc import Generator
from dataclasses import dataclass
from datetime import date, time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import Base, PlannerTask, User
from app.security import create_access_token


JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"


@dataclass
class PlannerTestContext:
    client: TestClient
    engine: Engine
    token: str
    user_id: int

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def planner_context() -> Generator[PlannerTestContext, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(username="planner_owner", password_hash="unused-test-hash")
        session.add(user)
        session.commit()
        session.refresh(user)
        user_id = user.id

    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret=JWT_SECRET,
        access_token_expire_minutes=30,
        _env_file=None,
    )
    token = create_access_token(user_id, JWT_SECRET, 30)

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings

    with TestClient(app) as client:
        yield PlannerTestContext(client, engine, token, user_id)

    app.dependency_overrides.clear()
    engine.dispose()


def task_payload(
    title: str = "Plan the week",
    task_date: str = "2026-09-14",
    start_time: str = "09:00:00",
    end_time: str = "10:00:00",
) -> dict[str, str]:
    return {
        "title": title,
        "task_date": task_date,
        "start_time": start_time,
        "end_time": end_time,
    }


def create_task(
    context: PlannerTestContext,
    **overrides: str,
) -> dict[str, object]:
    payload = task_payload(**overrides)
    response = context.client.post(
        "/api/planner/tasks",
        json=payload,
        headers=context.headers,
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.parametrize(
    ("method", "path", "json"),
    [
        ("POST", "/api/planner/tasks", task_payload()),
        (
            "GET",
            "/api/planner/tasks?start_date=2026-09-14&end_date=2026-09-20",
            None,
        ),
        ("GET", "/api/planner/tasks/1", None),
        ("PATCH", "/api/planner/tasks/1", {"title": "Updated"}),
        ("DELETE", "/api/planner/tasks/1", None),
    ],
)
def test_planner_endpoints_require_authentication(
    planner_context: PlannerTestContext,
    method: str,
    path: str,
    json: dict[str, str] | None,
) -> None:
    response = planner_context.client.request(method, path, json=json)

    assert response.status_code == 401
    assert response.json() == {
        "detail": "Invalid or missing authentication token."
    }


def test_successful_task_creation_returns_only_safe_fields(
    planner_context: PlannerTestContext,
) -> None:
    response = planner_context.client.post(
        "/api/planner/tasks",
        json=task_payload(title="  Focus block  "),
        headers=planner_context.headers,
    )

    assert response.status_code == 201
    body = response.json()
    assert set(body) == {
        "id",
        "title",
        "task_date",
        "start_time",
        "end_time",
        "is_completed",
        "created_at",
        "updated_at",
    }
    assert body["title"] == "Focus block"
    assert body["is_completed"] is False
    assert "password" not in response.text.lower()
    assert "token" not in response.text.lower()
    assert "user_id" not in body

    with Session(planner_context.engine) as session:
        stored_task = session.scalar(select(PlannerTask))
        assert stored_task is not None
        assert stored_task.user_id == planner_context.user_id


def test_task_creation_never_accepts_user_id(
    planner_context: PlannerTestContext,
) -> None:
    payload: dict[str, object] = task_payload()
    payload["user_id"] = 9999

    response = planner_context.client.post(
        "/api/planner/tasks",
        json=payload,
        headers=planner_context.headers,
    )

    assert response.status_code == 422
    with Session(planner_context.engine) as session:
        assert session.scalar(select(PlannerTask)) is None


@pytest.mark.parametrize("title", ["   ", "x" * 201])
def test_task_creation_rejects_invalid_title(
    planner_context: PlannerTestContext,
    title: str,
) -> None:
    response = planner_context.client.post(
        "/api/planner/tasks",
        json=task_payload(title=title),
        headers=planner_context.headers,
    )

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("start_time", "end_time"),
    [("10:00:00", "10:00:00"), ("11:00:00", "10:00:00")],
)
def test_task_creation_rejects_invalid_time_range(
    planner_context: PlannerTestContext,
    start_time: str,
    end_time: str,
) -> None:
    response = planner_context.client.post(
        "/api/planner/tasks",
        json=task_payload(start_time=start_time, end_time=end_time),
        headers=planner_context.headers,
    )

    assert response.status_code == 422


def test_task_creation_rejects_timezone_aware_times(
    planner_context: PlannerTestContext,
) -> None:
    response = planner_context.client.post(
        "/api/planner/tasks",
        json=task_payload(start_time="09:00:00+05:30", end_time="10:00:00+05:30"),
        headers=planner_context.headers,
    )

    assert response.status_code == 422


def test_date_range_listing_is_filtered_and_ordered(
    planner_context: PlannerTestContext,
) -> None:
    create_task(
        planner_context,
        title="Tuesday later",
        task_date="2026-09-15",
        start_time="14:00:00",
        end_time="15:00:00",
    )
    create_task(
        planner_context,
        title="Monday",
        task_date="2026-09-14",
        start_time="10:00:00",
        end_time="11:00:00",
    )
    create_task(
        planner_context,
        title="Tuesday earlier",
        task_date="2026-09-15",
        start_time="08:00:00",
        end_time="09:00:00",
    )
    create_task(
        planner_context,
        title="Outside range",
        task_date="2026-10-01",
        start_time="08:00:00",
        end_time="09:00:00",
    )

    response = planner_context.client.get(
        "/api/planner/tasks",
        params={"start_date": "2026-09-14", "end_date": "2026-09-20"},
        headers=planner_context.headers,
    )

    assert response.status_code == 200
    assert [task["title"] for task in response.json()] == [
        "Monday",
        "Tuesday earlier",
        "Tuesday later",
    ]


def test_list_requires_valid_limited_date_range(
    planner_context: PlannerTestContext,
) -> None:
    missing_dates = planner_context.client.get(
        "/api/planner/tasks",
        headers=planner_context.headers,
    )
    reversed_dates = planner_context.client.get(
        "/api/planner/tasks",
        params={"start_date": "2026-09-20", "end_date": "2026-09-14"},
        headers=planner_context.headers,
    )
    excessive_range = planner_context.client.get(
        "/api/planner/tasks",
        params={"start_date": "2026-09-01", "end_date": "2026-10-02"},
        headers=planner_context.headers,
    )

    assert missing_dates.status_code == 422
    assert reversed_dates.status_code == 422
    assert excessive_range.status_code == 422
    assert excessive_range.json() == {"detail": "Date range cannot exceed 31 days."}


def test_task_details_can_be_updated(planner_context: PlannerTestContext) -> None:
    task = create_task(planner_context)

    response = planner_context.client.patch(
        f"/api/planner/tasks/{task['id']}",
        json={
            "title": "Revised focus block",
            "task_date": "2026-09-16",
            "start_time": "11:00:00",
            "end_time": "12:30:00",
        },
        headers=planner_context.headers,
    )

    assert response.status_code == 200
    assert response.json()["title"] == "Revised focus block"
    assert response.json()["task_date"] == "2026-09-16"
    assert response.json()["start_time"] == "11:00:00"
    assert response.json()["end_time"] == "12:30:00"


def test_task_can_be_marked_completed_and_incomplete(
    planner_context: PlannerTestContext,
) -> None:
    task = create_task(planner_context)

    completed = planner_context.client.patch(
        f"/api/planner/tasks/{task['id']}",
        json={"is_completed": True},
        headers=planner_context.headers,
    )
    incomplete = planner_context.client.patch(
        f"/api/planner/tasks/{task['id']}",
        json={"is_completed": False},
        headers=planner_context.headers,
    )

    assert completed.status_code == 200
    assert completed.json()["is_completed"] is True
    assert incomplete.status_code == 200
    assert incomplete.json()["is_completed"] is False


def test_partial_time_update_must_keep_valid_range(
    planner_context: PlannerTestContext,
) -> None:
    task = create_task(planner_context)

    response = planner_context.client.patch(
        f"/api/planner/tasks/{task['id']}",
        json={"start_time": "10:30:00"},
        headers=planner_context.headers,
    )

    assert response.status_code == 422


def test_task_can_be_deleted(planner_context: PlannerTestContext) -> None:
    task = create_task(planner_context)

    deleted = planner_context.client.delete(
        f"/api/planner/tasks/{task['id']}",
        headers=planner_context.headers,
    )
    missing = planner_context.client.get(
        f"/api/planner/tasks/{task['id']}",
        headers=planner_context.headers,
    )

    assert deleted.status_code == 204
    assert deleted.content == b""
    assert missing.status_code == 404


def test_missing_task_returns_404(planner_context: PlannerTestContext) -> None:
    response = planner_context.client.get(
        "/api/planner/tasks/9999",
        headers=planner_context.headers,
    )

    assert response.status_code == 404
    assert response.json() == {"detail": "Planner task not found."}


def test_task_ownership_is_isolated(planner_context: PlannerTestContext) -> None:
    with Session(planner_context.engine) as session:
        other_user = User(username="other_user", password_hash="unused-test-hash")
        session.add(other_user)
        session.flush()
        other_task = PlannerTask(
            user_id=other_user.id,
            title="Another user's task",
            task_date=date(2026, 9, 15),
            start_time=time(9, 0),
            end_time=time(10, 0),
        )
        session.add(other_task)
        session.commit()
        other_task_id = other_task.id

    get_response = planner_context.client.get(
        f"/api/planner/tasks/{other_task_id}",
        headers=planner_context.headers,
    )
    patch_response = planner_context.client.patch(
        f"/api/planner/tasks/{other_task_id}",
        json={"title": "Not allowed"},
        headers=planner_context.headers,
    )
    delete_response = planner_context.client.delete(
        f"/api/planner/tasks/{other_task_id}",
        headers=planner_context.headers,
    )
    list_response = planner_context.client.get(
        "/api/planner/tasks",
        params={"start_date": "2026-09-14", "end_date": "2026-09-20"},
        headers=planner_context.headers,
    )

    assert get_response.status_code == 404
    assert patch_response.status_code == 404
    assert delete_response.status_code == 404
    assert list_response.status_code == 200
    assert list_response.json() == []
