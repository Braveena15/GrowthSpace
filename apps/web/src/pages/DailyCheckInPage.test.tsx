import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CheckIn, CheckInQuestion } from "../api/checkins";
import { NapList, ResponsibilityList, DailyCheckInPage } from "./DailyCheckInPage";

const ratingQuestion: CheckInQuestion = {
  key: "M1",
  category: "Mental and emotional health",
  subcategory: "Mood",
  text: "How was your overall mood today?",
  kind: "rating",
  required: true,
  minimum: 1,
  maximum: 5,
  choices: [],
  scale_labels: ["Very low", "Low", "Okay", "Good", "Excellent"],
};

const emptyCheckIn: CheckIn = {
  id: 1,
  local_date: "2026-09-14",
  question_set_version: "2026-09-13-v2",
  status: "draft",
  created_at: "2026-09-14T00:00:00Z",
  updated_at: "2026-09-14T00:00:00Z",
  submitted_at: null,
  answers: [],
  notes: [],
  naps: [],
  responsibilities: [],
  total_nap_minutes: 0,
  total_daily_sleep_minutes: null,
  responsibility_count: 0,
};

function response(body: object, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function initialFetch(saveResponses: number[] = [], questions: CheckInQuestion[] = [ratingQuestion]) {
  return vi.fn<typeof fetch>(async (input, init = {}) => {
    const url = String(input);
    if (url.includes("/questions")) return response({ local_date: "2026-09-14", version: "2026-09-13-v2", questions });
    if (init.method === "PUT" && /check-ins\/\d{4}-\d{2}-\d{2}$/.test(url)) return response(emptyCheckIn);
    const status = saveResponses.shift() ?? 200;
    return response({ ...emptyCheckIn, answers: [{ question_key: "M1", numeric_value: 4, choice_value: null }] }, status);
  });
}

function NapHarness() {
  const [naps, setNaps] = useState<Array<number | null>>([30]);
  return <NapList naps={naps} nightSleepMinutes={420} onChange={setNaps} />;
}

function ResponsibilityHarness() {
  const [items, setItems] = useState(["Prepared dinner"]);
  return <ResponsibilityList items={items} onChange={setItems} />;
}

describe("DailyCheckInPage", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("autosaves a rating and displays the modern status", async () => {
    const fetchMock = initialFetch();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MemoryRouter><DailyCheckInPage accessToken="jwt-token" /></MemoryRouter>);
    await user.click(await screen.findByRole("radio", { name: "4: Good" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Saved just now" })).toBeInTheDocument());
    const saveCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT" && String(init.body).includes("M1"));
    expect(saveCall?.[1]?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer jwt-token" });
  });

  it("flushes a pending save before Next changes category", async () => {
    let finishSave: ((value: Response) => void) | undefined;
    const fetchMock = vi.fn<typeof fetch>((input, init = {}) => {
      const url = String(input);
      if (url.includes("/questions")) return Promise.resolve(response({ local_date: "2026-09-14", version: "2026-09-13-v2", questions: [ratingQuestion] }));
      if (init.method === "PUT" && /check-ins\/\d{4}-\d{2}-\d{2}$/.test(url)) return Promise.resolve(response(emptyCheckIn));
      return new Promise<Response>((resolve) => { finishSave = resolve; });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<MemoryRouter><DailyCheckInPage accessToken="jwt-token" /></MemoryRouter>);
    await user.click(await screen.findByRole("radio", { name: "3: Okay" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Mental and emotional health" })).toBeInTheDocument();
    finishSave?.(response(emptyCheckIn));
    await screen.findByRole("heading", { name: "Character and maturity" });
  });

  it("offers Retry after a failed save", async () => {
    vi.stubGlobal("fetch", initialFetch([500, 200]));
    const user = userEvent.setup();
    render(<MemoryRouter><DailyCheckInPage accessToken="jwt-token" /></MemoryRouter>);
    await user.click(await screen.findByRole("radio", { name: "5: Excellent" }));
    const retry = await screen.findByRole("button", { name: "Couldn’t save — Retry" });
    await user.click(retry);
    await screen.findByRole("button", { name: "Saved just now" });
  });

  it("shows naps only while daytime sleep is Yes", async () => {
    const daytimeQuestion: CheckInQuestion = {
      ...ratingQuestion,
      key: "P3",
      category: "Physical health",
      subcategory: "Daytime sleep",
      text: "Did you sleep during the day?",
      kind: "choice",
      minimum: null,
      maximum: null,
      choices: ["Yes", "No"],
      scale_labels: [],
    };
    vi.stubGlobal("fetch", initialFetch([], [daytimeQuestion]));
    const user = userEvent.setup();
    render(<MemoryRouter><DailyCheckInPage accessToken="jwt-token" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Mental and emotional health" });
    for (let index = 0; index < 4; index += 1) await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByRole("heading", { name: "Nap 1" })).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "No" }));
    expect(screen.queryByRole("heading", { name: "Nap 1" })).not.toBeInTheDocument();
  });

  it("shows responsibility items only while the answer is Yes", async () => {
    const responsibilityQuestion: CheckInQuestion = {
      ...ratingQuestion,
      key: "I1",
      category: "Independence and finances",
      subcategory: "Independent responsibility",
      text: "Did you complete at least one important responsibility without unnecessary help today?",
      kind: "choice",
      minimum: null,
      maximum: null,
      choices: ["Yes", "No", "N/A"],
      scale_labels: [],
    };
    vi.stubGlobal("fetch", initialFetch([], [responsibilityQuestion]));
    const user = userEvent.setup();
    render(<MemoryRouter><DailyCheckInPage accessToken="jwt-token" /></MemoryRouter>);
    await screen.findByRole("heading", { name: "Mental and emotional health" });
    for (let index = 0; index < 7; index += 1) await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: "Yes" }));
    expect(screen.getByLabelText("Responsibility 1")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "N/A" }));
    expect(screen.queryByLabelText("Responsibility 1")).not.toBeInTheDocument();
  });
});

describe("conditional check-in lists", () => {
  it("adds, totals, and removes naps", async () => {
    const user = userEvent.setup();
    render(<NapHarness />);
    expect(screen.getByText("7 hours 30 minutes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add another nap/ }));
    expect(screen.getByRole("heading", { name: "Nap 2" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove Nap 1" }));
    expect(screen.queryByRole("button", { name: "Remove Nap 2" })).not.toBeInTheDocument();
  });

  it("adds, counts, edits, and removes responsibilities", async () => {
    const user = userEvent.setup();
    render(<ResponsibilityHarness />);
    expect(screen.getByText("1 responsibility completed.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add another responsibility/ }));
    await user.type(screen.getByLabelText("Responsibility 2"), "Paid a bill");
    expect(screen.getByText("2 responsibilities completed.")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Remove" })[0]);
    expect(screen.getByText("1 responsibility completed.")).toBeInTheDocument();
  });
});
