from collections.abc import Generator
from dataclasses import dataclass
from datetime import date, time, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.config import Settings, get_settings
from app.database import get_session
from app.main import app
from app.models import (
    Base,
    CheckInAnswer,
    CheckInCategoryNote,
    CheckInNap,
    CheckInResponsibility,
    DailyCheckIn,
    DailyNoteAnalysis,
    PlannerTask,
    User,
)
from app.routes.auth import get_current_user
from app.security import create_access_token
from app.services.note_analysis import normalize_sources, source_fingerprint
from app.services.weekly_report import build_weekly_report


JWT_SECRET = "test-secret-that-is-long-enough-for-hs256-signing"
MONDAY = date(2026, 9, 14)


@dataclass
class ReportContext:
    client: TestClient
    engine: Engine
    user_id: int
    other_user_id: int
    headers: dict[str, str]


@pytest.fixture
def report_context() -> Generator[ReportContext, None, None]:
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    with Session(engine) as session:
        owner = User(username="report_owner", password_hash="unused")
        other = User(username="report_other", password_hash="unused")
        session.add_all([owner, other])
        session.commit()
        session.refresh(owner)
        session.refresh(other)
        owner_id, other_id = owner.id, other.id
    settings = Settings(
        database_url="postgresql+psycopg://test:test@localhost/test",
        jwt_secret=JWT_SECRET,
        _env_file=None,
    )

    def session_override() -> Generator[Session, None, None]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = session_override
    app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(app) as client:
        yield ReportContext(
            client,
            engine,
            owner_id,
            other_id,
            {"Authorization": f"Bearer {create_access_token(owner_id, JWT_SECRET, 30)}"},
        )
    app.dependency_overrides.clear()
    engine.dispose()


def add_check_in(
    session: Session,
    user_id: int,
    day: date,
    answers: dict[str, float | str] | None = None,
    *,
    status: str = "submitted",
) -> DailyCheckIn:
    check_in = DailyCheckIn(user_id=user_id, local_date=day, status=status)
    session.add(check_in)
    session.flush()
    for key, value in (answers or {}).items():
        session.add(CheckInAnswer(
            check_in_id=check_in.id,
            question_key=key,
            numeric_value=float(value) if isinstance(value, (int, float)) else None,
            choice_value=value if isinstance(value, str) else None,
        ))
    return check_in


def seed_metric_week(context: ReportContext) -> None:
    with Session(context.engine) as session:
        monday = add_check_in(session, context.user_id, MONDAY, {
            "M1": 4, "P1M": 0, "P2": 90, "P3": "No", "D1": 0,
            "D2": 45, "I1": "Yes", "SC1": "Yes", "SC2": "Yes",
        })
        session.add_all([
            CheckInResponsibility(check_in_id=monday.id, position=1, description="Private one"),
            CheckInResponsibility(check_in_id=monday.id, position=2, description="Private two"),
        ])
        tuesday = add_check_in(session, context.user_id, MONDAY + timedelta(days=1), {
            "M1": 2, "P1M": 480, "P2": 30, "P3": "Yes", "D1": 20,
            "D2": 75, "I1": "No", "SC1": "No", "SC3": "Yes",
        })
        session.add(CheckInNap(check_in_id=tuesday.id, position=1, duration_minutes=30))
        add_check_in(session, context.user_id, MONDAY + timedelta(days=2), {}, status="draft")
        add_check_in(session, context.other_user_id, MONDAY, {"M1": 5, "P2": 600})
        session.add_all([
            PlannerTask(user_id=context.user_id, title="Private title", task_date=MONDAY, start_time=time(9), end_time=time(10), is_completed=True),
            PlannerTask(user_id=context.user_id, title="Private title two", task_date=MONDAY, start_time=time(9, 30), end_time=time(10, 30), is_completed=False),
            PlannerTask(user_id=context.other_user_id, title="Other private title", task_date=MONDAY, start_time=time(9), end_time=time(10), is_completed=True),
        ])
        session.commit()


def get_report(context: ReportContext, start: date = MONDAY):
    return context.client.get(
        "/api/reports/weekly", params={"week_start": start.isoformat()}, headers=context.headers
    )


def metric(items: list[dict[str, object]], key_name: str, key: str) -> dict[str, object]:
    return next(item for item in items if item[key_name] == key)


def test_weekly_report_requires_authentication_and_valid_monday(report_context: ReportContext) -> None:
    assert report_context.client.get(
        "/api/reports/weekly", params={"week_start": MONDAY.isoformat()}
    ).status_code == 401
    invalid = get_report(report_context, MONDAY + timedelta(days=1))
    malformed = report_context.client.get(
        "/api/reports/weekly", params={"week_start": "not-a-date"}, headers=report_context.headers
    )
    assert invalid.status_code == 422
    assert invalid.json() == {"detail": "week_start must be a Monday."}
    assert malformed.status_code == 422
    assert "not-a-date" not in malformed.text


def test_week_boundaries_statuses_and_future_days(report_context: ReportContext) -> None:
    with Session(report_context.engine) as session:
        previous = build_weekly_report(session, report_context.user_id, MONDAY - timedelta(days=7), today=MONDAY)
        current = build_weekly_report(session, report_context.user_id, MONDAY, today=MONDAY + timedelta(days=2))
        future = build_weekly_report(session, report_context.user_id, MONDAY + timedelta(days=7), today=MONDAY)
    assert previous.week_status == "previous"
    assert previous.week_end == MONDAY - timedelta(days=1)
    assert previous.eligible_elapsed_days == 7
    assert len(previous.missing_elapsed_dates) == 7
    assert current.week_status == "current"
    assert current.eligible_elapsed_days == 3
    assert [item.status for item in current.daily_status[3:]] == ["upcoming"] * 4
    assert current.upcoming_dates == [MONDAY + timedelta(days=offset) for offset in range(3, 7)]
    assert future.week_status == "future"
    assert future.eligible_elapsed_days == 0
    assert future.missing_elapsed_dates == []
    assert [item.status for item in future.daily_status] == ["upcoming"] * 7


def test_metrics_preserve_missing_and_zero_and_exclude_other_users(report_context: ReportContext) -> None:
    seed_metric_week(report_context)
    with Session(report_context.engine) as session:
        report = build_weekly_report(
            session, report_context.user_id, MONDAY, today=MONDAY + timedelta(days=6)
        ).model_dump(mode="json")
    mood = metric(report["rating_metrics"], "question_key", "M1")
    assert mood["average"] == 3.0
    assert mood["recorded_count"] == 2
    assert [item["value"] for item in mood["daily_values"][:3]] == [4.0, 2.0, None]
    sleep = metric(report["duration_metrics"], "metric_key", "P1M")
    activity = metric(report["duration_metrics"], "metric_key", "P2")
    naps = metric(report["duration_metrics"], "metric_key", "P3_NAP_MINUTES")
    meditation = metric(report["duration_metrics"], "metric_key", "D1")
    assert sleep["total_minutes"] == 480 and sleep["average_minutes"] == 240
    assert sleep["recorded_days"] == 2
    assert sleep["daily_values"][0]["value"] == 0
    assert activity["total_minutes"] == 120 and activity["average_minutes"] == 60
    assert [item["value"] for item in naps["daily_values"][:3]] == [0, 30, None]
    assert meditation["recorded_days"] == 2 and meditation["daily_values"][0]["value"] == 0
    assert report["recorded_check_in_days"] == 2


def test_boolean_responsibility_care_category_and_planner_aggregation(report_context: ReportContext) -> None:
    seed_metric_week(report_context)
    with Session(report_context.engine) as session:
        report = build_weekly_report(
            session, report_context.user_id, MONDAY, today=MONDAY + timedelta(days=6)
        ).model_dump(mode="json")
    moisturizer = metric(report["boolean_metrics"], "question_key", "SC1")
    assert (moisturizer["yes_count"], moisturizer["no_count"], moisturizer["recorded_count"]) == (1, 1, 2)
    assert report["responsibility_counts"]["weekly_total"] == 2
    assert [item["value"] for item in report["responsibility_counts"]["daily_counts"][:3]] == [2, 0, None]
    treatment1 = report["scheduled_care_consistency"][0]
    assert treatment1["label"] == "Did you complete Treatment 1 today?"
    assert treatment1["applicable_dates"] == ["2026-09-14", "2026-09-16"]
    assert treatment1["recorded_count"] == 1
    mental = metric(report["category_completion_summaries"], "category", "Mental and emotional health")
    assert mental["daily"][0]["applicable_required_question_count"] == 3
    assert mental["daily"][0]["answered_required_question_count"] == 1
    assert mental["daily"][0]["completion_state"] == "incomplete"
    planner = report["planner_summary"]
    assert planner == {
        "total_planned_tasks": 2,
        "completed_tasks": 1,
        "incomplete_tasks": 1,
        "completion_percentage": 50.0,
        "daily": planner["daily"],
    }
    assert planner["daily"][0]["planned_count"] == 2
    assert planner["daily"][0]["completed_count"] == 1
    assert "Private title" not in str(report)
    assert "Private one" not in str(report)


def test_zero_task_empty_week_is_safe(report_context: ReportContext) -> None:
    response = get_report(report_context, date.today() - timedelta(days=date.today().weekday()))
    assert response.status_code == 200
    body = response.json()
    assert body["planner_summary"]["total_planned_tasks"] == 0
    assert body["planner_summary"]["completion_percentage"] is None
    assert body["reviewed_reflections"] == []


def test_only_current_accepted_owned_reflections_are_included(report_context: ReportContext) -> None:
    with Session(report_context.engine) as session:
        states = [("accepted", False), ("accepted", True), ("draft", False), ("rejected", False)]
        for offset, (status, outdated) in enumerate(states):
            day = MONDAY + timedelta(days=offset)
            check_in = add_check_in(session, report_context.user_id, day, {})
            note_text = f"Source {offset}"
            session.add(CheckInCategoryNote(check_in_id=check_in.id, category="Career", note=note_text))
            sources = normalize_sources([("Career", "Changed") if outdated else ("Career", note_text)])
            session.add(DailyNoteAnalysis(
                user_id=report_context.user_id,
                check_in_id=check_in.id,
                local_date=day,
                summary=f"Summary {offset}",
                positive_actions=["Positive"], challenges=[], possible_improvements=[],
                themes=["Theme"], reflection_question="Question?", status=status,
                model_name="test-model", prompt_version="test", source_fingerprint=source_fingerprint(sources),
            ))
        other_check_in = add_check_in(session, report_context.other_user_id, MONDAY + timedelta(days=4), {})
        session.add(CheckInCategoryNote(check_in_id=other_check_in.id, category="Career", note="Other"))
        session.add(DailyNoteAnalysis(
            user_id=report_context.other_user_id, check_in_id=other_check_in.id,
            local_date=MONDAY + timedelta(days=4), summary="Other secret", positive_actions=[],
            challenges=[], possible_improvements=[], themes=[], reflection_question="Other?",
            status="accepted", model_name="test", prompt_version="test",
            source_fingerprint=source_fingerprint(normalize_sources([("Career", "Other")])),
        ))
        session.commit()
        report = build_weekly_report(session, report_context.user_id, MONDAY, today=MONDAY + timedelta(days=6))
    assert [item.summary for item in report.reviewed_reflections] == ["Summary 0"]
    assert report.outdated_accepted_analysis_count == 1
    assert "Other secret" not in report.model_dump_json()


def test_report_does_not_call_ai_and_uses_fixed_query_count(report_context: ReportContext, monkeypatch: pytest.MonkeyPatch) -> None:
    seed_metric_week(report_context)
    monkeypatch.setattr(
        "app.services.note_analysis.OllamaNoteAnalysisProvider.analyse",
        lambda *args, **kwargs: pytest.fail("Weekly reports must never call AI."),
    )
    select_count = 0

    def count_selects(*args: object) -> None:
        nonlocal select_count
        statement = str(args[2]).lstrip().upper()
        if statement.startswith("SELECT"):
            select_count += 1

    event.listen(report_context.engine, "before_cursor_execute", count_selects)
    try:
        with Session(report_context.engine) as session:
            build_weekly_report(session, report_context.user_id, MONDAY, today=MONDAY)
    finally:
        event.remove(report_context.engine, "before_cursor_execute", count_selects)
    assert select_count == 7


def test_database_failure_returns_generic_message(report_context: ReportContext) -> None:
    class BrokenSession:
        def scalars(self, *args: object, **kwargs: object) -> None:
            raise OperationalError("select", {}, Exception("private database detail"))

    app.dependency_overrides[get_current_user] = lambda: User(id=report_context.user_id, username="owner", password_hash="unused")
    app.dependency_overrides[get_session] = lambda: BrokenSession()
    try:
        response = get_report(report_context)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
    assert response.status_code == 503
    assert response.json() == {"detail": "Weekly report is temporarily unavailable."}
    assert "private" not in response.text.lower()
