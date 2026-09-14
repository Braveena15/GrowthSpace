from collections import defaultdict
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.checkin_definitions import CATEGORY_ORDER, QUESTIONS, Question, questions_for_date
from app.models import (
    CheckInAnswer,
    CheckInCategoryNote,
    CheckInNap,
    CheckInResponsibility,
    DailyCheckIn,
    DailyNoteAnalysis,
    PlannerTask,
)
from app.schemas.report import (
    BooleanMetric,
    CategoryCompletionSummary,
    CategoryDayCompletion,
    DailyBooleanValue,
    DailyCountValue,
    DailyMinutesValue,
    DailyNumberValue,
    DailyStatus,
    DurationMetric,
    PlannerDaySummary,
    PlannerSummary,
    RatingMetric,
    ResponsibilitySummary,
    ReviewedReflection,
    ScheduledCareDay,
    ScheduledCareMetric,
    WeeklyReportResponse,
)
from app.services.note_analysis import normalize_sources, source_fingerprint


NAP_METRIC_KEY = "P3_NAP_MINUTES"
DURATION_QUESTION_KEYS = tuple(
    question.key for question in QUESTIONS if question.kind in {"duration", "integer"}
)
RATING_QUESTIONS = tuple(question for question in QUESTIONS if question.kind == "rating")
BOOLEAN_QUESTIONS = tuple(question for question in QUESTIONS if question.kind == "choice")


def week_dates(week_start: date) -> list[date]:
    return [week_start + timedelta(days=offset) for offset in range(7)]


def report_week_status(week_start: date, today: date) -> str:
    current_start = today - timedelta(days=today.weekday())
    if week_start < current_start:
        return "previous"
    if week_start > current_start:
        return "future"
    return "current"


def rounded_average(values: list[int | float], digits: int = 1) -> float | None:
    return None if not values else round(sum(values) / len(values), digits)


def _load_week_data(session: Session, user_id: int, start: date, end: date):
    check_ins = list(
        session.scalars(
            select(DailyCheckIn).where(
                DailyCheckIn.user_id == user_id,
                DailyCheckIn.local_date >= start,
                DailyCheckIn.local_date <= end,
            )
        )
    )
    check_in_ids = [check_in.id for check_in in check_ins]
    answers = list(
        session.scalars(select(CheckInAnswer).where(CheckInAnswer.check_in_id.in_(check_in_ids)))
    )
    naps = list(
        session.scalars(select(CheckInNap).where(CheckInNap.check_in_id.in_(check_in_ids)))
    )
    responsibilities = list(
        session.scalars(
            select(CheckInResponsibility).where(CheckInResponsibility.check_in_id.in_(check_in_ids))
        )
    )
    notes = list(
        session.scalars(
            select(CheckInCategoryNote).where(CheckInCategoryNote.check_in_id.in_(check_in_ids))
        )
    )
    analyses = list(
        session.scalars(
            select(DailyNoteAnalysis).where(
                DailyNoteAnalysis.user_id == user_id,
                DailyNoteAnalysis.check_in_id.in_(check_in_ids),
                DailyNoteAnalysis.local_date >= start,
                DailyNoteAnalysis.local_date <= end,
                DailyNoteAnalysis.status == "accepted",
            )
        )
    )
    tasks = list(
        session.scalars(
            select(PlannerTask).where(
                PlannerTask.user_id == user_id,
                PlannerTask.task_date >= start,
                PlannerTask.task_date <= end,
            )
        )
    )
    return check_ins, answers, naps, responsibilities, notes, analyses, tasks


def build_weekly_report(
    session: Session,
    user_id: int,
    week_start: date,
    *,
    today: date | None = None,
) -> WeeklyReportResponse:
    """Build a deterministic report using a fixed set of bulk database queries."""
    today = today or date.today()
    dates = week_dates(week_start)
    week_end = dates[-1]
    status = report_week_status(week_start, today)
    check_ins, answers, naps, responsibilities, notes, analyses, tasks = _load_week_data(
        session, user_id, week_start, week_end
    )

    all_check_ins_by_date = {item.local_date: item for item in check_ins}
    # A future-dated record is never presented as completed data. This keeps a
    # current or future report honest even if data was inserted out of sequence.
    recorded_by_date = {
        item.local_date: item
        for item in check_ins
        if item.status == "submitted" and item.local_date <= today
    }
    recorded_ids = {item.id for item in recorded_by_date.values()}
    answers_by_check_in: dict[int, dict[str, CheckInAnswer]] = defaultdict(dict)
    for answer in answers:
        if answer.check_in_id in recorded_ids:
            answers_by_check_in[answer.check_in_id][answer.question_key] = answer
    naps_by_check_in: dict[int, list[CheckInNap]] = defaultdict(list)
    for nap in naps:
        if nap.check_in_id in recorded_ids:
            naps_by_check_in[nap.check_in_id].append(nap)
    responsibilities_by_check_in: dict[int, list[CheckInResponsibility]] = defaultdict(list)
    for responsibility in responsibilities:
        if responsibility.check_in_id in recorded_ids:
            responsibilities_by_check_in[responsibility.check_in_id].append(responsibility)

    eligible_dates = [day for day in dates if day <= today]
    upcoming_dates = [day for day in dates if day > today]
    missing_dates = [day for day in eligible_dates if day not in recorded_by_date]
    daily_status = [
        DailyStatus(
            date=day,
            status=(
                "upcoming" if day > today
                else "recorded" if day in recorded_by_date
                else "no_check_in"
            ),
        )
        for day in dates
    ]

    category_summaries: list[CategoryCompletionSummary] = []
    for category in CATEGORY_ORDER:
        daily_completion: list[CategoryDayCompletion] = []
        for day in dates:
            applicable = [
                question for question in questions_for_date(day)
                if question.category == category and question.required
            ]
            check_in = recorded_by_date.get(day)
            answered = 0 if check_in is None else sum(
                question.key in answers_by_check_in[check_in.id] for question in applicable
            )
            if day > today:
                completion_state = "upcoming"
            elif check_in is None:
                completion_state = "not_recorded"
            elif answered == len(applicable):
                completion_state = "complete"
            else:
                completion_state = "incomplete"
            daily_completion.append(CategoryDayCompletion(
                date=day,
                applicable_required_question_count=len(applicable),
                answered_required_question_count=answered,
                completion_state=completion_state,
            ))
        elapsed = [item for item in daily_completion if item.date <= today]
        category_summaries.append(CategoryCompletionSummary(
            category=category,
            total_applicable_required_question_count=sum(
                item.applicable_required_question_count for item in elapsed
            ),
            total_answered_required_question_count=sum(
                item.answered_required_question_count for item in elapsed
            ),
            complete_recorded_days=sum(item.completion_state == "complete" for item in elapsed),
            daily=daily_completion,
        ))

    def numeric_value(day: date, key: str) -> float | None:
        check_in = recorded_by_date.get(day)
        if check_in is None:
            return None
        answer = answers_by_check_in[check_in.id].get(key)
        return None if answer is None else answer.numeric_value

    rating_metrics: list[RatingMetric] = []
    for question in RATING_QUESTIONS:
        values = [numeric_value(day, question.key) for day in dates]
        recorded = [value for value in values if value is not None]
        rating_metrics.append(RatingMetric(
            question_key=question.key,
            category=question.category,
            subcategory=question.subcategory,
            label=question.text,
            daily_values=[DailyNumberValue(date=day, value=value) for day, value in zip(dates, values)],
            average=rounded_average(recorded),
            recorded_count=len(recorded),
        ))

    duration_questions = {question.key: question for question in QUESTIONS}
    duration_metrics: list[DurationMetric] = []
    for key in DURATION_QUESTION_KEYS:
        question = duration_questions[key]
        values: list[int | None] = []
        for day in dates:
            value = numeric_value(day, key)
            if key == "P1M" and value is None:
                legacy_hours = numeric_value(day, "P1")
                value = None if legacy_hours is None else legacy_hours * 60
            values.append(None if value is None else int(round(value)))
        recorded = [value for value in values if value is not None]
        duration_metrics.append(DurationMetric(
            metric_key=key,
            source_question_key=key,
            category=question.category,
            subcategory=question.subcategory,
            label=question.text,
            daily_values=[DailyMinutesValue(date=day, value=value) for day, value in zip(dates, values)],
            total_minutes=sum(recorded),
            average_minutes=None if not recorded else round(sum(recorded) / len(recorded)),
            recorded_days=len(recorded),
        ))

    nap_values: list[int | None] = []
    for day in dates:
        check_in = recorded_by_date.get(day)
        if check_in is None:
            nap_values.append(None)
            continue
        daytime_answer = answers_by_check_in[check_in.id].get("P3")
        if daytime_answer is None or daytime_answer.choice_value not in {"Yes", "No"}:
            nap_values.append(None)
        elif daytime_answer.choice_value == "No":
            nap_values.append(0)
        else:
            nap_values.append(sum(nap.duration_minutes for nap in naps_by_check_in[check_in.id]))
    recorded_naps = [value for value in nap_values if value is not None]
    p3 = duration_questions["P3"]
    duration_metrics.append(DurationMetric(
        metric_key=NAP_METRIC_KEY,
        source_question_key="P3",
        category=p3.category,
        subcategory=p3.subcategory,
        label="Daytime sleep or naps",
        daily_values=[DailyMinutesValue(date=day, value=value) for day, value in zip(dates, nap_values)],
        total_minutes=sum(recorded_naps),
        average_minutes=None if not recorded_naps else round(sum(recorded_naps) / len(recorded_naps)),
        recorded_days=len(recorded_naps),
    ))

    boolean_metrics = [_build_boolean_metric(question, dates, recorded_by_date, answers_by_check_in) for question in BOOLEAN_QUESTIONS]
    responsibility_daily = [
        DailyCountValue(
            date=day,
            value=(None if day not in recorded_by_date else len(
                responsibilities_by_check_in[recorded_by_date[day].id]
            )),
        )
        for day in dates
    ]
    responsibility_values = [item.value for item in responsibility_daily if item.value is not None]

    moisturizer = _build_care_metric(duration_questions["SC1"], dates, today, recorded_by_date, answers_by_check_in)
    scheduled_care = [
        _build_care_metric(duration_questions[key], dates, today, recorded_by_date, answers_by_check_in)
        for key in ("SC2", "SC3")
    ]

    tasks_by_date: dict[date, list[PlannerTask]] = defaultdict(list)
    for task in tasks:
        tasks_by_date[task.task_date].append(task)
    completed_tasks = sum(task.is_completed for task in tasks)
    planner = PlannerSummary(
        total_planned_tasks=len(tasks),
        completed_tasks=completed_tasks,
        incomplete_tasks=len(tasks) - completed_tasks,
        completion_percentage=None if not tasks else round(completed_tasks / len(tasks) * 100, 1),
        daily=[PlannerDaySummary(
            date=day,
            planned_count=len(tasks_by_date[day]),
            completed_count=sum(task.is_completed for task in tasks_by_date[day]),
        ) for day in dates],
    )

    notes_by_check_in: dict[int, list[tuple[str, str]]] = defaultdict(list)
    for note in notes:
        notes_by_check_in[note.check_in_id].append((note.category, note.note))
    current_reflections: list[ReviewedReflection] = []
    outdated_count = 0
    for analysis in sorted(analyses, key=lambda item: item.local_date):
        if analysis.local_date > today:
            continue
        sources = normalize_sources(notes_by_check_in[analysis.check_in_id])
        if analysis.source_fingerprint != source_fingerprint(sources):
            outdated_count += 1
            continue
        current_reflections.append(ReviewedReflection(
            local_date=analysis.local_date,
            summary=analysis.summary,
            positive_actions=analysis.positive_actions,
            challenges=analysis.challenges,
            possible_improvements=analysis.possible_improvements,
            themes=analysis.themes,
            reflection_question=analysis.reflection_question,
        ))

    return WeeklyReportResponse(
        week_start=week_start,
        week_end=week_end,
        week_status=status,
        daily_status=daily_status,
        recorded_check_in_days=len(recorded_by_date),
        eligible_elapsed_days=len(eligible_dates),
        total_week_days=7,
        missing_elapsed_dates=missing_dates,
        upcoming_dates=upcoming_dates,
        category_completion_summaries=category_summaries,
        rating_metrics=rating_metrics,
        duration_metrics=duration_metrics,
        boolean_metrics=boolean_metrics,
        responsibility_counts=ResponsibilitySummary(
            daily_counts=responsibility_daily,
            weekly_total=sum(responsibility_values),
            recorded_days=len(responsibility_values),
        ),
        daily_moisturizer_consistency=moisturizer,
        scheduled_care_consistency=scheduled_care,
        planner_summary=planner,
        reviewed_reflections=current_reflections,
        outdated_accepted_analysis_count=outdated_count,
    )


def _build_boolean_metric(
    question: Question,
    dates: list[date],
    recorded_by_date: dict[date, DailyCheckIn],
    answers_by_check_in: dict[int, dict[str, CheckInAnswer]],
) -> BooleanMetric:
    raw_values: list[str | None] = []
    for day in dates:
        check_in = recorded_by_date.get(day)
        answer = None if check_in is None else answers_by_check_in[check_in.id].get(question.key)
        raw_values.append(None if answer is None else answer.choice_value)
    return BooleanMetric(
        question_key=question.key,
        category=question.category,
        subcategory=question.subcategory,
        label=question.text,
        daily_values=[DailyBooleanValue(
            date=day,
            value=True if value == "Yes" else False if value == "No" else None,
        ) for day, value in zip(dates, raw_values)],
        yes_count=sum(value == "Yes" for value in raw_values),
        no_count=sum(value == "No" for value in raw_values),
        recorded_count=sum(value in {"Yes", "No"} for value in raw_values),
        not_applicable_count=sum(value in {"N/A", "No spending"} for value in raw_values),
    )


def _build_care_metric(
    question: Question,
    dates: list[date],
    today: date,
    recorded_by_date: dict[date, DailyCheckIn],
    answers_by_check_in: dict[int, dict[str, CheckInAnswer]],
) -> ScheduledCareMetric:
    applicable_dates = [day for day in dates if not question.weekdays or day.weekday() in question.weekdays]
    daily: list[ScheduledCareDay] = []
    raw_values: list[str] = []
    for day in dates:
        applicable = day in applicable_dates
        check_in = recorded_by_date.get(day)
        answer = None if check_in is None else answers_by_check_in[check_in.id].get(question.key)
        raw = None if not applicable or answer is None else answer.choice_value
        if raw in {"Yes", "No"}:
            raw_values.append(raw)
        daily.append(ScheduledCareDay(
            date=day,
            applicable=applicable,
            value=True if raw == "Yes" else False if raw == "No" else None,
        ))
    return ScheduledCareMetric(
        question_key=question.key,
        label=question.text,
        applicable_dates=applicable_dates,
        daily_values=daily,
        yes_count=sum(value == "Yes" for value in raw_values),
        no_count=sum(value == "No" for value in raw_values),
        recorded_count=len(raw_values),
        applicable_elapsed_days=sum(day <= today for day in applicable_dates),
    )
