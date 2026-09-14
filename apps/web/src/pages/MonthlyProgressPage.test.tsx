import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthlyProgress } from "../api/reports";
import { MonthlyProgressPage } from "./MonthlyProgressPage";

function report(overrides: Partial<MonthlyProgress> = {}): MonthlyProgress {
  return {
    tracking_started_on: "2026-09-14", period_start: "2026-09-14", period_end: "2026-10-13", period_status: "current", previous_period_start: "2026-08-14", next_period_start: "2026-10-14", has_previous_period: true,
    comparison_period_start: "2026-08-14", comparison_period_end: "2026-09-12", comparison_label: "Current cycle compared with the same elapsed days", daily_status: [{ date: "2026-09-14", status: "recorded" }, { date: "2026-09-15", status: "no_check_in" }, { date: "2026-10-13", status: "upcoming" }], recorded_check_in_days: 1, eligible_elapsed_days: 2, total_month_days: 30, missing_elapsed_dates: ["2026-09-15"], upcoming_dates: ["2026-10-13"],
    category_completion_summaries: categories(),
    rating_metrics: [{ question_key: "M1", category: "Mental and emotional health", subcategory: "Mood", label: "Mood", average: 4, recorded_count: 2, daily_values: points(4, null, 4), comparison: comparison(1) }, { question_key: "M2", category: "Mental and emotional health", subcategory: "Self-belief", label: "Self-belief", average: 3, recorded_count: 2, daily_values: points(3, 0, null), comparison: comparison() }, { question_key: "M3", category: "Mental and emotional health", subcategory: "Emotional recovery", label: "Emotional recovery", average: null, recorded_count: 0, daily_values: points(null, null, null), comparison: comparison() }],
    duration_metrics: [{ metric_key: "P1M", source_question_key: "P1M", category: "Physical health", subcategory: "Sleep", label: "Night sleep", total_minutes: 90, average_minutes: 90, recorded_days: 2, daily_values: points(90, null, 0), comparison: comparison(30) }, { metric_key: "P3_NAP_MINUTES", source_question_key: "P3", category: "Physical health", subcategory: "Daytime sleep", label: "Daytime rest", total_minutes: 30, average_minutes: 30, recorded_days: 1, daily_values: points(null, 30, null), comparison: comparison() }, { metric_key: "P2", source_question_key: "P2", category: "Physical health", subcategory: "Physical activity", label: "Physical activity", total_minutes: 0, average_minutes: 0, recorded_days: 1, daily_values: points(0, null, null), comparison: comparison() }, { metric_key: "D1", source_question_key: "D1", category: "Discipline and digital wellbeing", subcategory: "Meditation", label: "Meditation", total_minutes: 20, average_minutes: 20, recorded_days: 1, daily_values: points(20, null, null), comparison: comparison(5) }, { metric_key: "D2", source_question_key: "D2", category: "Discipline and digital wellbeing", subcategory: "Non-essential phone use", label: "Non-essential phone use", total_minutes: 0, average_minutes: 0, recorded_days: 1, daily_values: points(0, null, null), comparison: comparison(-10) }], boolean_metrics: [],
    responsibility_counts: { daily_counts: [], weekly_total: 0, recorded_days: 0, days_with_entries: 0, average_per_recorded_check_in_day: null, comparison: comparison() }, daily_moisturizer_consistency: care(), scheduled_care_consistency: [], planner_summary: { total_planned_tasks: 0, completed_tasks: 0, incomplete_tasks: 0, completion_percentage: null, daily: [], tasks_per_eligible_day: null, comparison: comparison() }, reviewed_reflections: [], outdated_accepted_analysis_count: 0,
    ...overrides,
  };
}
function comparison(difference: number | null = null) { return { value: null, recorded_count: 0, comparison_value: null, comparison_recorded_count: 0, difference, direction: difference === null ? "unavailable" as const : "increased" as const }; }
function care() { return { question_key: "SC1", label: "Moisturizer", applicable_dates: [], daily_values: [], yes_count: 0, no_count: 0, recorded_count: 0, applicable_elapsed_days: 0, percentage: null, comparison: comparison() }; }
function points(...values: Array<number | null>) { return values.map((value, index) => ({ date: `2026-09-${String(14 + index).padStart(2, "0")}`, value })); }
function categories() { return ["Mental and emotional health", "Character and maturity", "Career", "Communication", "Physical health", "Discipline and digital wellbeing", "Independence and finances"].map((category, index) => ({ category, completion_percentage: index === 1 ? null : 50, answered_required_question_count: 3, applicable_required_question_count: 6, completed_check_in_days: index + 1, comparison: comparison() })); }
function renderPage() { return render(<MemoryRouter><MonthlyProgressPage accessToken="jwt-token" /></MemoryRouter>); }

describe("MonthlyProgressPage", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("requests the current personalized cycle without a month parameter and preserves report information", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(report()), { status: 200 }));
    renderPage();
    expect(await screen.findByText("September 14 – October 13, 2026")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("http://localhost:8000/api/reports/monthly", expect.objectContaining({ headers: { Authorization: "Bearer jwt-token" } }));
    expect(screen.getByText("Tracking started: September 14, 2026")).toBeInTheDocument(); expect(screen.queryByText("Tracking started: September 13, 2026")).not.toBeInTheDocument(); expect(screen.getByText("1 check-in recorded")).toBeInTheDocument(); expect(screen.getByText("Recorded dates:")).toBeInTheDocument(); expect(screen.queryByText("No check-in")).not.toBeInTheDocument(); expect(screen.queryByText("Upcoming")).not.toBeInTheDocument();
  });

  it("uses API-provided cycle boundaries for previous, next, and current navigation", async () => {
    const user = userEvent.setup();
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(report()), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(report({ period_start: "2026-08-14", period_end: "2026-09-13", previous_period_start: null, next_period_start: "2026-09-14", has_previous_period: false })), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(report({ period_start: "2026-09-14", period_end: "2026-10-13", previous_period_start: "2026-08-14", next_period_start: "2026-10-14" })), { status: 200 })).mockResolvedValueOnce(new Response(JSON.stringify(report({ period_start: "2026-10-14", period_end: "2026-11-13", previous_period_start: "2026-09-14", next_period_start: "2026-11-14", period_status: "future" })), { status: 200 }));
    renderPage(); await screen.findByText("September 14 – October 13, 2026");
    await user.click(screen.getByRole("button", { name: "Previous cycle" }));
    expect(await screen.findByText("August 14 – September 13, 2026")).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith("http://localhost:8000/api/reports/monthly?period_start=2026-08-14", expect.anything());
    expect(screen.getByRole("button", { name: "Previous cycle" })).toBeDisabled(); expect(screen.getByText("No previous progress cycle exists.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Current cycle" }));
    await screen.findByText("September 14 – October 13, 2026");
    expect(fetch).toHaveBeenLastCalledWith("http://localhost:8000/api/reports/monthly", expect.anything());
    await user.click(screen.getByRole("button", { name: "Next cycle" }));
    expect(await screen.findByText("October 14 – November 13, 2026")).toBeInTheDocument();
    expect(fetch).toHaveBeenLastCalledWith("http://localhost:8000/api/reports/monthly?period_start=2026-10-14", expect.anything());
  });

  it("displays ranges that cross calendar years", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(report({ period_start: "2026-12-31", period_end: "2027-01-30" })), { status: 200 }));
    renderPage();
    expect(await screen.findByText("December 31, 2026 – January 30, 2027")).toBeInTheDocument();
  });

  it("explains the no-tracking state without rendering false missing days", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ detail: "Monthly progress begins after the first saved check-in response." }), { status: 409 }));
    renderPage();
    expect(await screen.findByText(/Your first saved Daily Check-in will start progress tracking/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to Daily Check-in" })).toHaveAttribute("href", "/daily-check-in");
    expect(screen.queryByText("No check-in")).not.toBeInTheDocument();
  });

  it("shows loading, a safe error, and Retry", async () => {
    let resolve!: (value: Response) => void;
    vi.mocked(fetch).mockImplementationOnce(() => new Promise((result) => { resolve = result; }));
    renderPage(); expect(screen.getByRole("status")).toHaveTextContent("Loading monthly progress");
    resolve(new Response(null, { status: 503 }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Monthly progress is temporarily unavailable.");
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify(report()), { status: 200 }));
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("September 14 – October 13, 2026")).toBeInTheDocument();
  });
  it("shows seven accessible category selectors with tracking consistency and no growth score", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(report()), { status: 200 }));
    renderPage(); await screen.findByRole("heading", { name: "Mental and emotional health self-ratings" });
    expect(screen.getAllByRole("tab")).toHaveLength(7);
    expect(screen.getAllByText(/Tracking consistency/)).toHaveLength(8);
    expect(document.querySelector(".category-selector-grid")).toBeInTheDocument(); expect(document.querySelector(".metric-chart-svg")).toBeInTheDocument();
    expect(screen.queryByText(/overall growth score/i)).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Mental and emotional health/ })).toHaveAttribute("aria-selected", "true");
  });

  it("renders mental self-ratings with a fixed scale, labelled series, gaps, and exact values", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(report()), { status: 200 }));
    renderPage(); await screen.findByRole("heading", { name: "Mental and emotional health self-ratings" });
    expect(screen.getByText("Self-rating (1–5)")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Mental and emotional health self-ratings/ })).toHaveAccessibleDescription(/Lines do not connect across missing/);
    const table = screen.getByRole("table", { name: /Exact values for Mental and emotional health self-ratings/ });
    expect(table).toHaveTextContent("Mood"); expect(table).toHaveTextContent("Self-belief"); expect(table).toHaveTextContent("No recorded value"); expect(table).toHaveTextContent("0 / 5");
  });

  it("selects physical and discipline details by keyboard without another API request", async () => {
    const user = userEvent.setup(); vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(report()), { status: 200 }));
    renderPage(); await screen.findByRole("heading", { name: "Mental and emotional health self-ratings" }); const initialCalls = vi.mocked(fetch).mock.calls.length;
    screen.getByRole("tab", { name: /Physical health/ }).focus(); await user.keyboard("{Enter}");
    expect(await screen.findByRole("heading", { name: "Sleep and daytime rest" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Physical activity" })).toBeInTheDocument(); expect(screen.getAllByText("1h 30m").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("tab", { name: /Discipline and digital wellbeing/ }));
    expect(await screen.findByRole("heading", { name: "Meditation duration" })).toBeInTheDocument(); expect(screen.getByRole("heading", { name: "Non-essential phone-use duration" })).toBeInTheDocument(); expect(screen.getAllByText("0m").length).toBeGreaterThan(0);
    expect(vi.mocked(fetch).mock.calls).toHaveLength(initialCalls);
  });

  it("uses current values instead of a trend for one recorded date and omits upcoming chart dates", async () => {
    const fixture = report();
    fixture.rating_metrics = fixture.rating_metrics.map((metric) => ({ ...metric, daily_values: [{ date: "2026-09-14", value: metric.question_key === "M1" ? 3 : null }] }));
    fixture.daily_status = [{ date: "2026-09-14", status: "recorded" }, { date: "2026-09-15", status: "upcoming" }];
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    renderPage();
    expect(await screen.findByText("More recorded days are needed to display a trend.")).toBeInTheDocument();
    expect(screen.getAllByText("Mood").length).toBeGreaterThan(0); expect(screen.getAllByText("3 / 5").length).toBeGreaterThan(0);
    expect(screen.queryByRole("img", { name: /Mental and emotional health self-ratings/ })).not.toBeInTheDocument();
  });

  it("limits chart date ticks and keeps missing values as separate line segments", async () => {
    const fixture = report(); const dates = Array.from({ length: 10 }, (_, index) => `2026-09-${String(14 + index).padStart(2, "0")}`);
    fixture.daily_status = dates.map((date, index) => ({ date, status: index === 9 ? "upcoming" : "recorded" as const }));
    fixture.rating_metrics[0] = { ...fixture.rating_metrics[0], daily_values: dates.map((date, index) => ({ date, value: index === 1 ? null : index < 9 ? 3 : 5 })) };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    renderPage(); const chart = await screen.findByRole("img", { name: /Mental and emotional health self-ratings/ });
    expect(chart.querySelectorAll(".chart-axis-text").length).toBeLessThanOrEqual(11);
    expect(chart.querySelector("path.chart-line")?.getAttribute("d")?.match(/M/g)?.length).toBeGreaterThan(1); expect(chart.textContent).not.toContain("Sep 23");
  });

  it("shows an empty recorded-date summary and short labels when no days are recorded", async () => {
    const fixture = report();
    fixture.daily_status = fixture.daily_status.map((day) => ({ ...day, status: day.status === "upcoming" ? "upcoming" as const : "no_check_in" as const }));
    fixture.recorded_check_in_days = 0;
    fixture.rating_metrics[0] = { ...fixture.rating_metrics[0], label: "How would you describe your mood today?" };
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(fixture), { status: 200 }));
    renderPage();
    expect(await screen.findByText("No check-ins have been recorded in this progress cycle yet.")).toBeInTheDocument();
    expect(screen.queryByText("Recorded dates:")).not.toBeInTheDocument();
    expect(screen.getAllByText("Mood").length).toBeGreaterThan(0);
    expect(screen.queryByText("How would you describe your mood today?")).not.toBeInTheDocument();
  });
});
