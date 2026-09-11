import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PlannerTask, getPlannerTasks } from "../api/planner";
import { addDays, addWeeks, formatDateKey, startOfWeekMonday } from "../utils/planner";
import { WeeklyPlannerPage } from "./WeeklyPlannerPage";

function jsonResponse(body: object, init?: ResponseInit) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function makeTask(overrides: Partial<PlannerTask> = {}): PlannerTask {
  return {
    id: 1,
    title: "Focus block",
    task_date: formatDateKey(startOfWeekMonday(new Date())),
    start_time: "09:00:00",
    end_time: "10:00:00",
    is_completed: false,
    created_at: "2026-09-10T12:00:00Z",
    updated_at: "2026-09-10T12:00:00Z",
    ...overrides,
  };
}

function createPlannerFetch(initialTasks: PlannerTask[] = []) {
  let tasks = [...initialTasks];
  const fetchMock = vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = String(input);
    const method = init.method ?? "GET";

    if (method === "GET") {
      return jsonResponse(tasks);
    }
    if (method === "POST") {
      const body = JSON.parse(String(init.body));
      const created = makeTask({ ...body, id: Math.max(0, ...tasks.map((task) => task.id)) + 1 });
      tasks = [...tasks, created];
      return jsonResponse(created, { status: 201 });
    }
    if (method === "PATCH") {
      const taskId = Number(url.split("/").at(-1));
      const body = JSON.parse(String(init.body));
      const current = tasks.find((task) => task.id === taskId)!;
      const updated = { ...current, ...body };
      tasks = tasks.map((task) => (task.id === taskId ? updated : task));
      return jsonResponse(updated);
    }
    if (method === "DELETE") {
      const taskId = Number(url.split("/").at(-1));
      tasks = tasks.filter((task) => task.id !== taskId);
      return new Response(null, { status: 204 });
    }
    throw new Error(`Unexpected request: ${method} ${url}`);
  });

  return fetchMock;
}

describe("WeeklyPlannerPage", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("fetches the Monday-to-Sunday range with the in-memory Bearer token", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(jsonResponse([]));
    const monday = startOfWeekMonday(new Date());

    await getPlannerTasks(
      "jwt-token",
      formatDateKey(monday),
      formatDateKey(addDays(monday, 6)),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:8000/api/planner/tasks?start_date=${formatDateKey(monday)}&end_date=${formatDateKey(addDays(monday, 6))}`,
      {
        method: "GET",
        signal: undefined,
        headers: { Authorization: "Bearer jwt-token" },
      },
    );
  });

  it("shows an honest empty-week state and the full week grid", async () => {
    vi.stubGlobal("fetch", createPlannerFetch());
    render(<WeeklyPlannerPage accessToken="jwt-token" />);

    expect(await screen.findByText("No tasks scheduled this week.")).toBeInTheDocument();
    expect(screen.getByLabelText("Weekly planner grid. Scroll horizontally to see every day.")).toBeInTheDocument();
    expect(screen.getAllByLabelText(/schedule$/)).toHaveLength(7);
    expect(screen.queryByText("Focus block")).not.toBeInTheDocument();
  });

  it("creates a task and refreshes the week", async () => {
    const fetchMock = createPlannerFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyPlannerPage accessToken="jwt-token" />);
    await screen.findByText("No tasks scheduled this week.");

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.type(screen.getByLabelText("Task title"), "Write outline");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await screen.findByText("Write outline");
    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(postCall?.[0]).toBe("http://localhost:8000/api/planner/tasks");
    expect(postCall?.[1]?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-token",
    });
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      title: "Write outline",
      start_time: "09:00:00",
      end_time: "09:30:00",
    });
  });

  it("rejects an end time that is not later than the start time", async () => {
    const fetchMock = createPlannerFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyPlannerPage accessToken="jwt-token" />);
    await screen.findByText("No tasks scheduled this week.");

    await user.click(screen.getByRole("button", { name: "Add task" }));
    await user.type(screen.getByLabelText("Task title"), "Invalid task");
    await user.selectOptions(screen.getByLabelText("Start time"), "10:00:00");
    await user.selectOptions(screen.getByLabelText("End time"), "09:30:00");
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(screen.getByRole("alert")).toHaveTextContent("End time must be later than start time.");
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(0);
  });

  it("edits an existing task", async () => {
    const fetchMock = createPlannerFetch([makeTask()]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyPlannerPage accessToken="jwt-token" />);

    await user.click(await screen.findByRole("button", { name: /Edit Focus block/ }));
    await user.clear(screen.getByLabelText("Task title"));
    await user.type(screen.getByLabelText("Task title"), "Deep work");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("Deep work")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([url, init]) =>
      String(url).endsWith("/api/planner/tasks/1") && init?.method === "PATCH",
    )).toBe(true);
  });

  it("toggles task completion", async () => {
    const fetchMock = createPlannerFetch([makeTask()]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyPlannerPage accessToken="jwt-token" />);

    await user.click(await screen.findByRole("button", { name: /Edit Focus block/ }));
    await user.click(screen.getByRole("checkbox", { name: "Completed" }));
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByRole("button", { name: /Focus block.*completed/ })).toBeInTheDocument();
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({ is_completed: true });
  });

  it("requires explicit confirmation before deleting", async () => {
    const fetchMock = createPlannerFetch([makeTask()]);
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyPlannerPage accessToken="jwt-token" />);

    await user.click(await screen.findByRole("button", { name: /Edit Focus block/ }));
    await user.click(screen.getByRole("button", { name: "Delete task" }));
    expect(screen.getByRole("alertdialog", { name: "Delete this task?" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(await screen.findByText("No tasks scheduled this week.")).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(true);
  });

  it("navigates to adjacent weeks and back to the current week", async () => {
    const fetchMock = createPlannerFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<WeeklyPlannerPage accessToken="jwt-token" />);
    await screen.findByText("No tasks scheduled this week.");
    const currentMonday = startOfWeekMonday(new Date());
    const nextMonday = addWeeks(currentMonday, 1);

    await user.click(screen.getByRole("button", { name: "Next week" }));
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes(
        `start_date=${formatDateKey(nextMonday)}&end_date=${formatDateKey(addDays(nextMonday, 6))}`,
      ))).toBe(true);
    });
    expect(screen.getByRole("button", { name: "Current week" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Current week" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Current week" })).toBeDisabled());
  });
});
