import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlannerTask } from "../api/planner";
import { HomePage } from "../pages/HomePage";
import { formatDateKey } from "../utils/planner";
import { TodaysPlan } from "./TodaysPlan";

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
    title: "Morning focus",
    task_date: "2026-09-11",
    start_time: "09:00:00",
    end_time: "10:00:00",
    is_completed: false,
    created_at: "2026-09-10T12:00:00Z",
    updated_at: "2026-09-10T12:00:00Z",
    ...overrides,
  };
}

function renderPlan(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  vi.stubGlobal("fetch", fetchMock);
  return render(
    <MemoryRouter>
      <TodaysPlan accessToken="jwt-token" dateKey="2026-09-11" />
    </MemoryRouter>,
  );
}

describe("Today's Plan", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests the browser's local date for both API query dates", async () => {
    const localNow = new Date(2026, 8, 11, 0, 30);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(localNow);

    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/api/health")) {
        return jsonResponse({ api: "connected", database: "connected" });
      }
      return jsonResponse([]);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <MemoryRouter>
        <HomePage accessToken="jwt-token" />
      </MemoryRouter>,
    );

    const expectedDate = formatDateKey(localNow);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `http://localhost:8000/api/planner/tasks?start_date=${expectedDate}&end_date=${expectedDate}`,
        {
          method: "GET",
          signal: expect.any(AbortSignal),
          headers: { Authorization: "Bearer jwt-token" },
        },
      );
    });
  });

  it("shows a loading state while today's tasks are pending", () => {
    const fetchMock = vi.fn<typeof fetch>(() => new Promise<Response>(() => {}));
    renderPlan(fetchMock);

    expect(screen.getByRole("status")).toHaveTextContent("Loading today's plan...");
  });

  it("shows an honest empty state for a day without tasks", async () => {
    renderPlan(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([])));

    expect(await screen.findByText("Nothing planned for today.")).toBeInTheDocument();
    expect(screen.getByText("Use the Weekly Planner to add a task.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Weekly Planner" })).toHaveAttribute(
      "href",
      "/weekly-planner",
    );
  });

  it("renders tasks in start-time order, including outside planner grid hours", async () => {
    const tasks = [
      makeTask({ id: 2, title: "Evening review", start_time: "21:30:00" }),
      makeTask({ id: 3, title: "Early walk", start_time: "05:00:00", end_time: "05:30:00" }),
      makeTask({ id: 1, title: "Morning focus", start_time: "09:00:00" }),
    ];
    renderPlan(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(tasks)));

    const list = await screen.findByRole("list", { name: "Today's tasks" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      expect.stringContaining("Early walk"),
      expect.stringContaining("Morning focus"),
      expect.stringContaining("Evening review"),
    ]);
    expect(screen.getByText("5:00 AM–5:30 AM")).toBeInTheDocument();
  });

  it("calculates completion progress from returned tasks", async () => {
    const tasks = [
      makeTask({ id: 1, is_completed: true }),
      makeTask({ id: 2, title: "Second task", is_completed: true }),
      makeTask({ id: 3, title: "Third task" }),
    ];
    renderPlan(vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(tasks)));

    expect(await screen.findByText("2 of 3 completed")).toBeInTheDocument();
  });

  it("toggles completion, prevents repeated updates, and refetches the day", async () => {
    let tasks = [makeTask()];
    let resolveUpdate: (response: Response) => void = () => {};
    const fetchMock = vi.fn<typeof fetch>(async (input, init = {}) => {
      if (init.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        tasks = tasks.map((task) => ({ ...task, ...body }));
        return new Promise<Response>((resolve) => {
          resolveUpdate = resolve;
        });
      }
      return jsonResponse(tasks);
    });
    renderPlan(fetchMock);
    const user = userEvent.setup();

    const checkbox = await screen.findByRole("checkbox", { name: "Mark Morning focus complete" });
    await user.click(checkbox);

    expect(checkbox).toBeDisabled();
    await user.click(checkbox);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH")).toHaveLength(1);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(patchCall?.[0]).toBe("http://localhost:8000/api/planner/tasks/1");
    expect(patchCall?.[1]?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer jwt-token",
    });
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({ is_completed: true });

    resolveUpdate(jsonResponse(tasks));
    expect(
      await screen.findByRole("checkbox", { name: "Mark Morning focus incomplete" }),
    ).toBeChecked();
    expect(screen.getByText("1 of 1 completed")).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => (init?.method ?? "GET") === "GET")).toHaveLength(
      2,
    );
  });

  it("shows a generic load error and retries successfully", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ detail: "Database unavailable" }, { status: 500 }))
      .mockResolvedValueOnce(jsonResponse([]));
    renderPlan(fetchMock);
    const user = userEvent.setup();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Today's tasks could not be loaded.",
    );
    expect(screen.queryByText("Database unavailable")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Nothing planned for today.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
