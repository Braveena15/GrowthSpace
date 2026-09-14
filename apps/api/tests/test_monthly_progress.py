from datetime import date, time

from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.models import Base, CheckInAnswer, DailyCheckIn, JournalEntry, PlannerTask, User
from app.services.monthly_progress import build_monthly_progress


def test_cycle_to_date_comparison_excludes_journal_and_preserves_zero() -> None:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool); Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(username="monthly-owner", password_hash="unused", tracking_started_on=date(2026, 8, 14)); session.add(user); session.flush()
        for day, mood, sleep in [(date(2026, 8, 14), 2, 60), (date(2026, 8, 15), 4, 120), (date(2026, 9, 14), 4, 0), (date(2026, 9, 15), 5, 90)]:
            checkin = DailyCheckIn(user_id=user.id, local_date=day, status="submitted"); session.add(checkin); session.flush(); session.add_all([CheckInAnswer(check_in_id=checkin.id, question_key="M1", numeric_value=mood), CheckInAnswer(check_in_id=checkin.id, question_key="P1M", numeric_value=sleep)])
        session.add(JournalEntry(user_id=user.id, title="Not report data", content="Must never be queried", entry_date=date(2026,9,14), entry_time=time(9))); session.commit()
        report = build_monthly_progress(session, user.id, user.tracking_started_on, 1, today=date(2026, 9, 15))
    assert report.period_start == date(2026, 9, 14) and report.period_end == date(2026, 10, 13)
    assert report.comparison_period_start == date(2026, 8, 14) and report.comparison_period_end == date(2026, 8, 15)
    mood = next(metric for metric in report.rating_metrics if metric.question_key == "M1")
    sleep = next(metric for metric in report.duration_metrics if metric.metric_key == "P1M")
    assert mood.average == 4.5 and mood.comparison.comparison_value == 3.0 and mood.comparison.direction == "increased"
    assert sleep.daily_values[0].value == 0 and sleep.recorded_days == 2
    assert report.recorded_check_in_days == 2 and "Not report data" not in report.model_dump_json()


def test_first_cycle_has_no_comparison_and_future_cycle_is_upcoming() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool); Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(username="monthly-future", password_hash="unused", tracking_started_on=date(2026, 9, 14)); session.add(user); session.commit(); session.refresh(user)
        first = build_monthly_progress(session, user.id, user.tracking_started_on, 0, today=date(2026, 9, 14))
        report = build_monthly_progress(session, user.id, user.tracking_started_on, 2, today=date(2026, 9, 14))
    assert first.previous_period_start is None and first.comparison_period_start is None
    assert report.period_status == "future" and report.comparison_period_start is None
    assert report.previous_period_start == date(2026, 10, 14)
    assert {item.status for item in report.daily_status} == {"upcoming"}


def test_first_cycle_never_marks_dates_before_tracking_as_missing() -> None:
    engine = create_engine("sqlite://", poolclass=StaticPool); Base.metadata.create_all(engine)
    with Session(engine) as session:
        user = User(username="monthly-first-cycle", password_hash="unused", tracking_started_on=date(2026, 9, 14)); session.add(user); session.commit(); session.refresh(user)
        report = build_monthly_progress(session, user.id, user.tracking_started_on, 0, today=date(2026, 9, 16))
    assert report.missing_elapsed_dates == [date(2026, 9, 14), date(2026, 9, 15), date(2026, 9, 16)]
    assert all(item.date >= user.tracking_started_on for item in report.daily_status)
