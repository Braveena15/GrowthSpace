import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JournalEntry } from "../api/journal";
import { JournalPage } from "./JournalPage";

const entry = (id: number, title: string | null, content: string, time = "10:00:00"): JournalEntry => ({ id, title, content, entry_date: "2026-09-14", entry_time: time, created_at: "2026-09-14T10:00:00Z", updated_at: "2026-09-14T10:00:00Z" });
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("JournalPage", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it("shows the empty state, opens an editor, validates content, and sends an authenticated create request", async () => {
    const fetchMock = vi.mocked(fetch); let entries: JournalEntry[] = [];
    fetchMock.mockImplementation(async (input, init = {}) => { if ((init.method ?? "GET") === "GET") return json({ entries, total: entries.length, offset: 0, limit: 20 }); const body = JSON.parse(String(init.body)); const created = entry(1, body.title || null, body.content); entries = [created]; return json(created, 201); });
    const user = userEvent.setup(); render(<JournalPage accessToken="jwt-token" />);
    expect(await screen.findByText(/Your journal is empty/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New entry" })); await user.click(screen.getByRole("button", { name: "Save entry" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Write something");
    await user.type(screen.getByLabelText("Title (optional)"), "A private title"); await user.type(screen.getByLabelText("Entry"), "Line one\nLine two"); await user.click(screen.getByRole("button", { name: "Save entry" }));
    expect(await screen.findByText("Entry saved.")).toBeInTheDocument();
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST"); expect(post?.[1]?.headers).toEqual({ "Content-Type": "application/json", Authorization: "Bearer jwt-token" }); expect(String(post?.[1]?.body)).toContain("Line one\\nLine two");
  });

  it("shows newest entries, searches, confirms deletion, and warns before discarding edits", async () => {
    const entries = [entry(2, null, "Newest full content", "12:00:00"), entry(1, "Older", "Older content", "09:00:00")];
    vi.mocked(fetch).mockImplementation(async (input, init = {}) => { const url = String(input); if ((init.method ?? "GET") === "DELETE") return new Response(null, { status: 204 }); const filtered = url.includes("query=missing") ? [] : entries; return json({ entries: filtered, total: filtered.length, offset: 0, limit: 20 }); });
    const user = userEvent.setup(); render(<JournalPage accessToken="jwt-token" />);
    expect(await screen.findByText("Untitled entry")).toBeInTheDocument(); expect(screen.getByText("Newest full content")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Edit" })[0]); await user.type(screen.getByLabelText("Entry"), " changed"); await user.click(screen.getByRole("button", { name: "New entry" })); expect(screen.getByRole("alertdialog", { name: "Discard unsaved changes?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Keep editing" })); expect(screen.queryByRole("alertdialog", { name: "Discard unsaved changes?" })).not.toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Cancel" })); await user.click(screen.getByRole("button", { name: "Discard changes" })); await user.click(screen.getAllByRole("button", { name: "Delete" })[0]); expect(screen.getByRole("alertdialog", { name: "Delete journal entry?" })).toBeInTheDocument(); await user.click(screen.getByRole("button", { name: "Cancel" })); expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Search"), "missing"); await user.click(screen.getByRole("button", { name: "Search" })); expect(await screen.findByText("No journal entries match these filters.")).toBeInTheDocument();
  });

  it("shows a retryable loading failure without browser storage", async () => {
    const fetchMock = vi.mocked(fetch); fetchMock.mockResolvedValueOnce(json({}, 503)).mockResolvedValue(json({ entries: [], total: 0, offset: 0, limit: 20 })); const user = userEvent.setup(); const storage = vi.spyOn(Storage.prototype, "setItem"); render(<JournalPage accessToken="jwt-token" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("temporarily unavailable"); await user.click(screen.getByRole("button", { name: "Retry" })); await waitFor(() => expect(screen.getByText(/Your journal is empty/)).toBeInTheDocument()); expect(storage).not.toHaveBeenCalled();
  });
});
