import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeeklyReport } from "../api/reports";
import { formatMinutes, WeeklyReportsPage } from "./WeeklyReportsPage";

function report(overrides: Partial<WeeklyReport> = {}): WeeklyReport {
  const monday = "2026-09-14";
  return {
    week_start: monday, week_end: "2026-09-20", week_status: "previous",
    daily_status: ["recorded", "no_check_in", "upcoming", "upcoming", "upcoming", "upcoming", "upcoming"].map((status, index) => ({ date: `2026-09-${String(14 + index).padStart(2, "0")}`, status: status as "recorded" | "no_check_in" | "upcoming" })),
    recorded_check_in_days: 1, eligible_elapsed_days: 2, total_week_days: 7, missing_elapsed_dates: ["2026-09-15"], upcoming_dates: ["2026-09-16"],
    category_completion_summaries: [], rating_metrics: [{ question_key: "M1", category: "Mental", subcategory: "Mood", label: "Mood", daily_values: [{ date: monday, value: 4 }], average: 4, recorded_count: 1 }],
    duration_metrics: [{ metric_key: "P1M", source_question_key: "P1M", category: "Physical", subcategory: "Sleep", label: "Sleep", daily_values: [{ date: monday, value: 90 }], total_minutes: 90, average_minutes: 90, recorded_days: 1 }], boolean_metrics: [],
    responsibility_counts: { daily_counts: [], weekly_total: 0, recorded_days: 0 }, daily_moisturizer_consistency: { label: "Did you use moisturizer today?", yes_count: 0, recorded_count: 0 }, scheduled_care_consistency: [],
    planner_summary: { total_planned_tasks: 0, completed_tasks: 0, incomplete_tasks: 0, completion_percentage: null, daily: [] }, reviewed_reflections: [], outdated_accepted_analysis_count: 0,
    ...overrides,
  };
}
function response(body: object, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }

describe("WeeklyReportsPage", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("loads one authenticated report request and presents status, gaps, and accessible trend data", async () => {
    vi.mocked(fetch).mockResolvedValue(response(report()));
    render(<WeeklyReportsPage accessToken="jwt-token" />);
    expect(screen.getByRole("status")).toHaveTextContent("Loading weekly report");
    expect(await screen.findByText("Recorded")).toBeInTheDocument();
    expect(screen.getByText("No check-in")).toBeInTheDocument();
    expect(screen.getAllByText("Upcoming")).toHaveLength(5);
    expect(screen.getByLabelText(/Mood:.*4/)).toBeInTheDocument();
    expect(screen.getByText("No planned tasks")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/api/reports/weekly?week_start="), expect.objectContaining({ headers: { Authorization: "Bearer jwt-token" } }));
  });

  it("navigates weeks and retries a generic failure", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(response({}, 503)).mockResolvedValue(response(report()));
    const user = userEvent.setup();
    render(<WeeklyReportsPage accessToken="jwt-token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load this report");
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("heading", { name: "Reviewed reflections" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => expect(fetchMock.mock.calls.length).toBeGreaterThan(2));
  });

  it("formats durations without decimal hours", () => {
    expect(formatMinutes(0)).toBe("0m"); expect(formatMinutes(45)).toBe("45m"); expect(formatMinutes(60)).toBe("1h"); expect(formatMinutes(90)).toBe("1h 30m");
  });

  it("shows planner data and reviewed reflections separately, including an outdated notice", async () => {
    vi.mocked(fetch).mockResolvedValue(response(report({
      planner_summary: { total_planned_tasks: 2, completed_tasks: 1, incomplete_tasks: 1, completion_percentage: 50, daily: [{ date: "2026-09-14", planned_count: 2, completed_count: 1 }] },
      reviewed_reflections: [{ local_date: "2026-09-14", summary: "A reviewed summary", positive_actions: ["Started early"], challenges: ["Low energy"], possible_improvements: ["Plan a break"], themes: ["Steady practice"], reflection_question: "What helped?" }],
      outdated_accepted_analysis_count: 1,
    })));
    render(<WeeklyReportsPage accessToken="jwt-token" />);
    expect(await screen.findByText("A reviewed summary")).toBeInTheDocument();
    expect(screen.getByText(/source notes changed and require review/)).toBeInTheDocument();
    expect(screen.getByText("Started early")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: "Planner tasks planned and completed by day" })).toBeInTheDocument();
  });
});
