import { useCallback, useEffect, useMemo, useState } from "react";
import { getWeeklyReport, WeeklyReport } from "../api/reports";
import { addWeeks, formatDateKey, formatWeekRange, startOfWeekMonday } from "../utils/planner";

type Props = { accessToken: string };
type LoadState = { status: "loading"; report: WeeklyReport | null } | { status: "ready"; report: WeeklyReport } | { status: "error"; report: WeeklyReport | null };

export function formatMinutes(minutes: number | null): string {
  if (minutes === null) return "No data";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}`;
}
function weekday(date: string) { return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(new Date(`${date}T12:00:00`)); }
function trendLabel(metric: { label: string; daily_values: { date: string; value: number | boolean | null }[] }, duration = false) {
  return `${metric.label}: ${metric.daily_values.map((point) => `${weekday(point.date)} ${duration && typeof point.value === "number" ? formatMinutes(point.value) : point.value ?? "No data"}`).join(", ")}`;
}

export function WeeklyReportsPage({ accessToken }: Props) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [state, setState] = useState<LoadState>({ status: "loading", report: null });
  const currentKey = formatDateKey(startOfWeekMonday(new Date()));
  const load = useCallback(async (signal?: AbortSignal) => {
    setState((previous) => ({ status: "loading", report: previous.report }));
    try { setState({ status: "ready", report: await getWeeklyReport(accessToken, formatDateKey(weekStart), signal) }); }
    catch (error) { if (!(error instanceof DOMException && error.name === "AbortError")) setState((previous) => ({ status: "error", report: previous.report })); }
  }, [accessToken, weekStart]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const report = state.report;
  const grouped = useMemo(() => report?.category_completion_summaries.map((category) => ({ ...category, ratings: report.rating_metrics.filter((m) => m.category === category.category), durations: report.duration_metrics.filter((m) => m.category === category.category), booleans: report.boolean_metrics.filter((m) => m.category === category.category) })) ?? [], [report]);
  const changeWeek = (offset: number) => setWeekStart((week) => addWeeks(week, offset));

  return <section className="page weekly-reports-page" aria-labelledby="weekly-report-heading">
    <header className="planner-page-header"><div><p className="eyebrow">Your recorded week</p><h1 id="weekly-report-heading">Weekly Report</h1><p className="week-range" aria-live="polite">{formatWeekRange(weekStart)}</p></div></header>
    <nav className="week-navigation" aria-label="Report week navigation"><button className="secondary-button" onClick={() => changeWeek(-1)}>Previous week</button><button className="secondary-button" disabled={formatDateKey(weekStart) === currentKey} onClick={() => setWeekStart(startOfWeekMonday(new Date()))}>Current week</button><button className="secondary-button" onClick={() => changeWeek(1)}>Next week</button></nav>
    {state.status === "loading" && <p role="status" className="planner-status">Loading weekly report…</p>}
    {state.status === "error" && <div className="error planner-load-error" role="alert"><strong>Unable to load this report</strong><p>The weekly report is temporarily unavailable.</p><button onClick={() => void load()}>Retry</button></div>}
    {!report ? null : <>
      <div className="report-overview" aria-label="Weekly overview"><article><span>Check-ins recorded</span><strong>{report.recorded_check_in_days} of {report.eligible_elapsed_days} elapsed days</strong></article><article><span>Category completion</span><strong>{report.category_completion_summaries.reduce((sum, item) => sum + item.total_answered_required_question_count, 0)} answers recorded</strong></article><article><span>Planner</span><strong>{report.planner_summary.total_planned_tasks ? `${report.planner_summary.completed_tasks} of ${report.planner_summary.total_planned_tasks} completed` : "No planned tasks"}</strong></article><article><span>Reviewed reflections</span><strong>{report.reviewed_reflections.length} available</strong></article></div>
      <section className="report-section"><h2>Daily status</h2><ul className="report-days">{report.daily_status.map((day) => <li key={day.date}><span>{weekday(day.date)}</span><strong>{day.status === "recorded" ? "Recorded" : day.status === "upcoming" ? "Upcoming" : "No check-in"}</strong></li>)}</ul></section>
      <section className="report-section"><h2>Trends</h2><p className="report-hint">Values are your self-ratings and recorded time, not objective measurements.</p><div className="trend-list">{[...report.rating_metrics.slice(0, 3), ...report.duration_metrics.filter((metric) => ["P1M", "P3_NAP_MINUTES", "P2", "D1", "D2"].includes(metric.metric_key))].map((metric) => <div className="trend-row" key={"metric_key" in metric ? metric.metric_key : metric.question_key} aria-label={trendLabel(metric, "metric_key" in metric)}><strong>{metric.label}</strong><div className="trend-values">{metric.daily_values.map((point) => <span key={point.date}><b>{weekday(point.date)}</b>{"metric_key" in metric && typeof point.value === "number" ? formatMinutes(point.value) : point.value ?? "—"}</span>)}</div></div>)}</div></section>
      <section className="report-section"><h2>Planner completion by day</h2>{report.planner_summary.total_planned_tasks === 0 ? <p>No planned tasks.</p> : <table className="report-table"><caption className="sr-only">Planner tasks planned and completed by day</caption><thead><tr><th>Day</th><th>Planned</th><th>Completed</th></tr></thead><tbody>{report.planner_summary.daily.map((day) => <tr key={day.date}><th>{weekday(day.date)}</th><td>{day.planned_count}</td><td>{day.completed_count}</td></tr>)}</tbody></table>}</section>
      <section className="report-section"><h2>Check-in categories</h2><div className="category-report-grid">{grouped.map((category) => <article key={category.category}><h3>{category.category}</h3><p>{category.total_answered_required_question_count} of {category.total_applicable_required_question_count} applicable required answers recorded</p>{[...category.ratings, ...category.durations, ...category.booleans].map((metric) => <div className="category-metric" key={"metric_key" in metric ? metric.metric_key : metric.question_key}><strong>{metric.subcategory}</strong><span>{metric.label}</span>{"average" in metric ? <em>{metric.average == null ? "No self-rating recorded" : `Average self-rating: ${metric.average.toFixed(1)} (${metric.recorded_count} recorded)`}</em> : "total_minutes" in metric ? <em>{formatMinutes(metric.total_minutes)} total · {metric.recorded_days} recorded days</em> : <em>{metric.yes_count} of {metric.recorded_count} recorded days</em>}</div>)}</article>)}</div></section>
      <section className="report-section"><h2>Responsibilities and scheduled care</h2><p>Independent responsibilities recorded: {report.responsibility_counts.weekly_total} items across {report.responsibility_counts.recorded_days} recorded days.</p><p>{report.daily_moisturizer_consistency.label}: {report.daily_moisturizer_consistency.yes_count} of {report.daily_moisturizer_consistency.recorded_count} recorded days.</p>{report.scheduled_care_consistency.map((care) => <p key={care.question_key}>{care.label}: {care.yes_count} of {care.recorded_count} recorded scheduled days.</p>)}</section>
      <section className="report-section"><h2>Reviewed reflections</h2>{report.outdated_accepted_analysis_count > 0 && <p className="report-notice">Some accepted reflections are not included because their source notes changed and require review.</p>}{report.reviewed_reflections.length === 0 ? <p>No accepted reflections for this week.</p> : report.reviewed_reflections.map((reflection) => <article className="reflection" key={reflection.local_date}><h3>{weekday(reflection.local_date)} reflection</h3><p>{reflection.summary}</p><ReflectionList title="Positive actions" items={reflection.positive_actions} /><ReflectionList title="Challenges" items={reflection.challenges} /><ReflectionList title="Possible improvements" items={reflection.possible_improvements} /><ReflectionList title="Themes" items={reflection.themes} /><p><strong>Reflection question:</strong> {reflection.reflection_question}</p></article>)}</section>
    </>}
  </section>;
}

function ReflectionList({ title, items }: { title: string; items: string[] }) {
  return items.length ? <div><strong>{title}</strong><ul>{items.map((item) => <li key={item}>{item}</li>)}</ul></div> : null;
}
