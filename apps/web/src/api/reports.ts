const API_BASE_URL = "http://localhost:8000";

export type DayStatus = "recorded" | "no_check_in" | "upcoming";
export type DailyValue<T> = { date: string; value: T | null };
export type CategoryCompletion = { date: string; applicable_required_question_count: number; answered_required_question_count: number; completion_state: "complete" | "incomplete" | "not_recorded" | "upcoming" };
export type Metric = { question_key: string; category: string; subcategory: string; label: string; daily_values: DailyValue<number | boolean>[]; average: number | null; recorded_count: number; yes_count?: number; no_count?: number };
export type BooleanMetric = { question_key: string; category: string; subcategory: string; label: string; daily_values: DailyValue<boolean>[]; yes_count: number; no_count: number; recorded_count: number; not_applicable_count: number };
export type DurationMetric = { metric_key: string; source_question_key: string; category: string; subcategory: string; label: string; daily_values: DailyValue<number>[]; total_minutes: number; average_minutes: number | null; recorded_days: number };
export type WeeklyReport = {
  week_start: string; week_end: string; week_status: "previous" | "current" | "future";
  daily_status: { date: string; status: DayStatus }[]; recorded_check_in_days: number; eligible_elapsed_days: number; total_week_days: number;
  missing_elapsed_dates: string[]; upcoming_dates: string[];
  category_completion_summaries: { category: string; total_applicable_required_question_count: number; total_answered_required_question_count: number; complete_recorded_days: number; daily: CategoryCompletion[] }[];
  rating_metrics: Metric[]; duration_metrics: DurationMetric[]; boolean_metrics: BooleanMetric[];
  responsibility_counts: { daily_counts: DailyValue<number>[]; weekly_total: number; recorded_days: number };
  daily_moisturizer_consistency: { label: string; yes_count: number; recorded_count: number };
  scheduled_care_consistency: { question_key: string; label: string; yes_count: number; recorded_count: number; applicable_elapsed_days: number }[];
  planner_summary: { total_planned_tasks: number; completed_tasks: number; incomplete_tasks: number; completion_percentage: number | null; daily: { date: string; planned_count: number; completed_count: number }[] };
  reviewed_reflections: { local_date: string; summary: string; positive_actions: string[]; challenges: string[]; possible_improvements: string[]; themes: string[]; reflection_question: string }[];
  outdated_accepted_analysis_count: number;
};

export async function getWeeklyReport(token: string, weekStart: string, signal?: AbortSignal): Promise<WeeklyReport> {
  const response = await fetch(`${API_BASE_URL}/api/reports/weekly?week_start=${encodeURIComponent(weekStart)}`, {
    headers: { Authorization: `Bearer ${token}` }, signal,
  });
  if (!response.ok) throw new Error("Weekly report is unavailable. Please try again.");
  return response.json() as Promise<WeeklyReport>;
}

export type ComparisonValue = { value: number | null; recorded_count: number; comparison_value: number | null; comparison_recorded_count: number; difference: number | null; direction: "increased" | "decreased" | "unchanged" | "unavailable" };
type MonthlyCareMetric = { question_key: string; label: string; applicable_dates: string[]; daily_values: { date: string; applicable: boolean; value: boolean | null }[]; yes_count: number; no_count: number; recorded_count: number; applicable_elapsed_days: number; percentage: number | null; comparison: ComparisonValue };
export type MonthlyProgress = {
  tracking_started_on: string | null; period_start: string; period_end: string; period_status: "previous" | "current" | "future"; previous_period_start: string | null; next_period_start: string; has_previous_period: boolean;
  comparison_period_start: string | null; comparison_period_end: string | null; comparison_label: string; daily_status: { date: string; status: DayStatus }[]; recorded_check_in_days: number; eligible_elapsed_days: number; total_month_days: number; missing_elapsed_dates: string[]; upcoming_dates: string[];
  category_completion_summaries: { category: string; applicable_required_question_count: number; answered_required_question_count: number; completion_percentage: number | null; completed_check_in_days: number; comparison: ComparisonValue }[];
  rating_metrics: { question_key: string; category: string; subcategory: string; label: string; daily_values: DailyValue<number>[]; average: number | null; recorded_count: number; comparison: ComparisonValue }[];
  duration_metrics: (DurationMetric & { comparison: ComparisonValue })[];
  boolean_metrics: { question_key: string; category: string; subcategory: string; label: string; daily_values: DailyValue<boolean>[]; yes_count: number; no_count: number; recorded_count: number; not_applicable_count: number; yes_percentage: number | null; comparison: ComparisonValue }[];
  responsibility_counts: { daily_counts: DailyValue<number>[]; weekly_total: number; recorded_days: number; days_with_entries: number; average_per_recorded_check_in_day: number | null; comparison: ComparisonValue };
  daily_moisturizer_consistency: MonthlyCareMetric; scheduled_care_consistency: MonthlyCareMetric[];
  planner_summary: { total_planned_tasks: number; completed_tasks: number; incomplete_tasks: number; completion_percentage: number | null; daily: { date: string; planned_count: number; completed_count: number }[]; tasks_per_eligible_day: number | null; comparison: ComparisonValue };
  reviewed_reflections: { local_date: string; summary: string; positive_actions: string[]; challenges: string[]; possible_improvements: string[]; themes: string[]; reflection_question: string }[]; outdated_accepted_analysis_count: number;
};

export class TrackingNotStartedError extends Error { constructor() { super("Tracking has not started yet."); } }
export async function getMonthlyProgress(token: string, periodStart: string | null, signal?: AbortSignal): Promise<MonthlyProgress> {
  const query = periodStart === null ? "" : `?period_start=${encodeURIComponent(periodStart)}`;
  const response = await fetch(`${API_BASE_URL}/api/reports/monthly${query}`, { headers: { Authorization: `Bearer ${token}` }, signal });
  if (response.status === 409) throw new TrackingNotStartedError();
  if (!response.ok) throw new Error("Monthly progress is temporarily unavailable. Please try again.");
  return response.json() as Promise<MonthlyProgress>;
}
