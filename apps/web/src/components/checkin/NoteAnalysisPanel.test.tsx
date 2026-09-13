import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoteAnalysisState } from "../../api/checkins";
import { NoteAnalysisPanel } from "./NoteAnalysisPanel";


const apiMocks = vi.hoisted(() => ({
  getNoteAnalysis: vi.fn(),
  generateNoteAnalysis: vi.fn(),
  updateNoteAnalysis: vi.fn(),
  acceptNoteAnalysis: vi.fn(),
  rejectNoteAnalysis: vi.fn(),
}));

vi.mock("../../api/checkins", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../api/checkins")>()),
  ...apiMocks,
}));

const content = {
  summary: "You completed a planned task and noted that time was limited.",
  positive_actions: ["You completed the planned task."],
  challenges: ["The note mentions limited time."],
  possible_improvements: ["You could choose one smaller next step."],
  themes: ["Planning"],
  reflection_question: "What helped you complete the task?",
};

function analysisState(overrides: Partial<NoteAnalysisState> = {}): NoteAnalysisState {
  return {
    enabled: true,
    has_notes: true,
    is_outdated: false,
    analysis: {
      id: 1,
      local_date: "2026-09-14",
      status: "draft",
      model_name: "qwen3:8b",
      prompt_version: "note-analysis-v1",
      created_at: "2026-09-14T10:00:00Z",
      updated_at: "2026-09-14T10:00:00Z",
      ...content,
    },
    ...overrides,
  };
}

function renderPanel() {
  return render(<NoteAnalysisPanel accessToken="jwt-token" localDate="2026-09-14" />);
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("NoteAnalysisPanel", () => {
  it("shows disabled and empty states without automatically generating", async () => {
    apiMocks.getNoteAnalysis.mockResolvedValueOnce({ enabled: false, has_notes: false, is_outdated: false, analysis: null });
    const first = renderPanel();
    expect(await screen.findByText("This local AI feature is currently disabled.")).toBeInTheDocument();
    expect(apiMocks.generateNoteAnalysis).not.toHaveBeenCalled();
    first.unmount();

    apiMocks.getNoteAnalysis.mockResolvedValueOnce({ enabled: true, has_notes: false, is_outdated: false, analysis: null });
    renderPanel();
    expect(await screen.findByText(/Add a Note in at least one category/)).toBeInTheDocument();
    expect(apiMocks.generateNoteAnalysis).not.toHaveBeenCalled();
  });

  it("shows loading and generates only after explicit user action", async () => {
    apiMocks.getNoteAnalysis.mockResolvedValueOnce({ enabled: true, has_notes: true, is_outdated: false, analysis: null });
    let finishGeneration: ((state: NoteAnalysisState) => void) | undefined;
    apiMocks.generateNoteAnalysis.mockImplementationOnce(() => new Promise((resolve) => { finishGeneration = resolve; }));
    const user = userEvent.setup();
    renderPanel();
    expect(screen.getByText("Loading note analysis…")).toBeInTheDocument();
    const analyse = await screen.findByRole("button", { name: "Analyse today’s notes" });
    expect(apiMocks.generateNoteAnalysis).not.toHaveBeenCalled();
    await user.click(analyse);
    expect(screen.getByRole("button", { name: "Analysing…" })).toBeDisabled();
    finishGeneration?.(analysisState());
    expect(await screen.findByText(content.summary)).toBeInTheDocument();
  });

  it("displays every structured section and the accuracy notice", async () => {
    apiMocks.getNoteAnalysis.mockResolvedValueOnce(analysisState());
    renderPanel();
    expect(await screen.findByRole("heading", { name: "Summary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Positive actions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Challenges" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Possible improvements" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Themes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Reflection question" })).toBeInTheDocument();
    expect(screen.getByText("AI-generated reflection may be inaccurate. Review it before accepting.")).toBeInTheDocument();
  });

  it("edits an analysis and returns it to draft", async () => {
    const updated = analysisState({ analysis: { ...analysisState().analysis!, ...content, summary: "Edited summary.", status: "draft" } });
    apiMocks.getNoteAnalysis.mockResolvedValueOnce(analysisState());
    apiMocks.updateNoteAnalysis.mockResolvedValueOnce(updated);
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    const summary = screen.getByLabelText("Summary");
    await user.clear(summary);
    await user.type(summary, "Edited summary.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(apiMocks.updateNoteAnalysis).toHaveBeenCalledWith(
      "jwt-token",
      "2026-09-14",
      expect.objectContaining({ summary: "Edited summary." }),
    );
    expect(await screen.findByText("Edited summary.")).toBeInTheDocument();
  });

  it("accepts and rejects an analysis", async () => {
    apiMocks.getNoteAnalysis.mockResolvedValueOnce(analysisState());
    apiMocks.acceptNoteAnalysis.mockResolvedValueOnce(analysisState({ analysis: { ...analysisState().analysis!, status: "accepted" } }));
    apiMocks.rejectNoteAnalysis.mockResolvedValueOnce(analysisState({ analysis: { ...analysisState().analysis!, status: "rejected" } }));
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Accept" }));
    expect(await screen.findByText("accepted")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reject" }));
    expect(await screen.findByText("rejected")).toBeInTheDocument();
  });

  it("requires confirmation before reanalysing an accepted result", async () => {
    const accepted = analysisState({ analysis: { ...analysisState().analysis!, status: "accepted" } });
    apiMocks.getNoteAnalysis.mockResolvedValueOnce(accepted);
    apiMocks.generateNoteAnalysis.mockResolvedValueOnce(analysisState());
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Reanalyse" }));
    expect(apiMocks.generateNoteAnalysis).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog", { name: "Replace the accepted analysis?" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Confirm reanalysis" }));
    expect(apiMocks.generateNoteAnalysis).toHaveBeenCalledWith("jwt-token", "2026-09-14", true);
  });

  it("warns when changed Notes make the analysis outdated", async () => {
    apiMocks.getNoteAnalysis.mockResolvedValueOnce(analysisState({ is_outdated: true }));
    renderPanel();
    expect(await screen.findByText("Your Notes have changed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeDisabled();
  });

  it("shows a generic failure and retries the failed generation", async () => {
    const empty = { enabled: true, has_notes: true, is_outdated: false, analysis: null };
    apiMocks.getNoteAnalysis.mockResolvedValueOnce(empty);
    apiMocks.generateNoteAnalysis.mockRejectedValueOnce(new Error("private provider failure"));
    apiMocks.generateNoteAnalysis.mockResolvedValueOnce(analysisState());
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Analyse today’s notes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The analysis request failed.");
    expect(screen.queryByText(/private provider failure/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText(content.summary)).toBeInTheDocument();
    expect(apiMocks.generateNoteAnalysis).toHaveBeenCalledTimes(2);
  });
});
