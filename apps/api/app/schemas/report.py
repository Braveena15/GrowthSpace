from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ReportModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class DailyStatus(ReportModel):
    date: date
    status: Literal["recorded", "no_check_in", "upcoming"]


class DailyNumberValue(ReportModel):
    date: date
    value: float | None


class DailyMinutesValue(ReportModel):
    date: date
    value: int | None


class DailyBooleanValue(ReportModel):
    date: date
    value: bool | None


class DailyCountValue(ReportModel):
    date: date
    value: int | None


class CategoryDayCompletion(ReportModel):
    date: date
    applicable_required_question_count: int
    answered_required_question_count: int
    completion_state: Literal["complete", "incomplete", "not_recorded", "upcoming"]


class CategoryCompletionSummary(ReportModel):
    category: str
    total_applicable_required_question_count: int
    total_answered_required_question_count: int
    complete_recorded_days: int
    daily: list[CategoryDayCompletion]


class RatingMetric(ReportModel):
    question_key: str
    category: str
    subcategory: str
    label: str
    daily_values: list[DailyNumberValue]
    average: float | None
    recorded_count: int


class DurationMetric(ReportModel):
    metric_key: str
    source_question_key: str
    category: str
    subcategory: str
    label: str
    daily_values: list[DailyMinutesValue]
    total_minutes: int
    average_minutes: int | None
    recorded_days: int


class BooleanMetric(ReportModel):
    question_key: str
    category: str
    subcategory: str
    label: str
    daily_values: list[DailyBooleanValue]
    yes_count: int
    no_count: int
    recorded_count: int
    not_applicable_count: int


class ResponsibilitySummary(ReportModel):
    daily_counts: list[DailyCountValue]
    weekly_total: int
    recorded_days: int


class ScheduledCareDay(ReportModel):
    date: date
    applicable: bool
    value: bool | None


class ScheduledCareMetric(ReportModel):
    question_key: str
    label: str
    applicable_dates: list[date]
    daily_values: list[ScheduledCareDay]
    yes_count: int
    no_count: int
    recorded_count: int
    applicable_elapsed_days: int


class PlannerDaySummary(ReportModel):
    date: date
    planned_count: int
    completed_count: int


class PlannerSummary(ReportModel):
    total_planned_tasks: int
    completed_tasks: int
    incomplete_tasks: int
    completion_percentage: float | None
    daily: list[PlannerDaySummary]


class ReviewedReflection(ReportModel):
    local_date: date
    summary: str
    positive_actions: list[str]
    challenges: list[str]
    possible_improvements: list[str]
    themes: list[str]
    reflection_question: str


class WeeklyReportResponse(ReportModel):
    week_start: date
    week_end: date
    week_status: Literal["previous", "current", "future"]
    daily_status: list[DailyStatus]
    recorded_check_in_days: int
    eligible_elapsed_days: int
    total_week_days: int
    missing_elapsed_dates: list[date]
    upcoming_dates: list[date]
    category_completion_summaries: list[CategoryCompletionSummary]
    rating_metrics: list[RatingMetric]
    duration_metrics: list[DurationMetric]
    boolean_metrics: list[BooleanMetric]
    responsibility_counts: ResponsibilitySummary
    daily_moisturizer_consistency: ScheduledCareMetric
    scheduled_care_consistency: list[ScheduledCareMetric]
    planner_summary: PlannerSummary
    reviewed_reflections: list[ReviewedReflection]
    outdated_accepted_analysis_count: int


class ComparisonValue(ReportModel):
    value: float | int | None
    recorded_count: int
    comparison_value: float | int | None
    comparison_recorded_count: int
    difference: float | int | None
    direction: Literal["increased", "decreased", "unchanged", "unavailable"]


class MonthlyRatingMetric(RatingMetric):
    comparison: ComparisonValue


class MonthlyDurationMetric(DurationMetric):
    comparison: ComparisonValue


class MonthlyBooleanMetric(BooleanMetric):
    yes_percentage: float | None
    comparison: ComparisonValue


class MonthlyCategoryCompletion(ReportModel):
    category: str
    applicable_required_question_count: int
    answered_required_question_count: int
    completion_percentage: float | None
    completed_check_in_days: int
    comparison: ComparisonValue


class MonthlyPlannerSummary(PlannerSummary):
    tasks_per_eligible_day: float | None
    comparison: ComparisonValue


class MonthlyResponsibilitySummary(ResponsibilitySummary):
    days_with_entries: int
    average_per_recorded_check_in_day: float | None
    comparison: ComparisonValue


class MonthlyCareMetric(ScheduledCareMetric):
    percentage: float | None
    comparison: ComparisonValue


class MonthlyProgressResponse(ReportModel):
    tracking_started_on: date | None
    period_start: date
    period_end: date
    period_status: Literal["previous", "current", "future"]
    previous_period_start: date | None
    next_period_start: date
    has_previous_period: bool
    comparison_period_start: date | None
    comparison_period_end: date | None
    comparison_label: str
    daily_status: list[DailyStatus]
    recorded_check_in_days: int
    eligible_elapsed_days: int
    total_month_days: int
    missing_elapsed_dates: list[date]
    upcoming_dates: list[date]
    category_completion_summaries: list[MonthlyCategoryCompletion]
    rating_metrics: list[MonthlyRatingMetric]
    duration_metrics: list[MonthlyDurationMetric]
    boolean_metrics: list[MonthlyBooleanMetric]
    responsibility_counts: MonthlyResponsibilitySummary
    daily_moisturizer_consistency: MonthlyCareMetric
    scheduled_care_consistency: list[MonthlyCareMetric]
    planner_summary: MonthlyPlannerSummary
    reviewed_reflections: list[ReviewedReflection]
    outdated_accepted_analysis_count: int
