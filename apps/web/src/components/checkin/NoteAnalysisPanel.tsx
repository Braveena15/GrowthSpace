import { FormEvent, useEffect, useRef, useState } from "react";

import {
  NoteAnalysisContent,
  NoteAnalysisState,
  acceptNoteAnalysis,
  generateNoteAnalysis,
  getNoteAnalysis,
  rejectNoteAnalysis,
  updateNoteAnalysis,
} from "../../api/checkins";


type NoteAnalysisPanelProps = {
  accessToken: string;
  localDate: string;
};

type EditDraft = {
  summary: string;
  positiveActions: string;
  challenges: string;
  possibleImprovements: string;
  themes: string;
  reflectionQuestion: string;
};

function toDraft(content: NoteAnalysisContent): EditDraft {
  return {
    summary: content.summary,
    positiveActions: content.positive_actions.join("\n"),
    challenges: content.challenges.join("\n"),
    possibleImprovements: content.possible_improvements.join("\n"),
    themes: content.themes.join("\n"),
    reflectionQuestion: content.reflection_question,
  };
}

function toList(value: string): string[] {
  return value.split("\n").map((item) => item.trim()).filter(Boolean);
}

export function NoteAnalysisPanel({ accessToken, localDate }: NoteAnalysisPanelProps) {
  const [state, setState] = useState<NoteAnalysisState | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [hasError, setHasError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<EditDraft | null>(null);
  const [confirmReanalysis, setConfirmReanalysis] = useState(false);
  const failedAction = useRef<(() => Promise<NoteAnalysisState>) | null>(null);

  async function load(signal?: AbortSignal) {
    setIsLoading(true);
    setHasError(false);
    try {
      setState(await getNoteAnalysis(accessToken, localDate, signal));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setHasError(true);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [accessToken, localDate]);

  async function perform(label: string, action: () => Promise<NoteAnalysisState>) {
    setBusyAction(label);
    setHasError(false);
    try {
      const result = await action();
      setState(result);
      failedAction.current = null;
      setConfirmReanalysis(false);
      return true;
    } catch {
      failedAction.current = action;
      setHasError(true);
      return false;
    } finally {
      setBusyAction("");
    }
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editDraft) return;
    const content: NoteAnalysisContent = {
      summary: editDraft.summary.trim(),
      positive_actions: toList(editDraft.positiveActions),
      challenges: toList(editDraft.challenges),
      possible_improvements: toList(editDraft.possibleImprovements),
      themes: toList(editDraft.themes),
      reflection_question: editDraft.reflectionQuestion.trim(),
    };
    if (await perform("Saving changes", () => updateNoteAnalysis(accessToken, localDate, content))) {
      setIsEditing(false);
    }
  }

  if (isLoading) {
    return <section className="analysis-panel analysis-state" aria-labelledby="analysis-heading"><span className="loading-orbit" aria-hidden="true" /><p role="status">Loading note analysis…</p></section>;
  }

  if (hasError && state === null) {
    return <section className="analysis-panel analysis-state" aria-labelledby="analysis-heading"><h2 id="analysis-heading">AI note analysis</h2><div className="analysis-error" role="alert"><strong>Note analysis is unavailable.</strong><p>Please try again.</p><button type="button" onClick={() => void load()}>Retry</button></div></section>;
  }

  if (!state?.enabled) {
    return <section className="analysis-panel analysis-state" aria-labelledby="analysis-heading"><h2 id="analysis-heading">AI note analysis</h2><p>This local AI feature is currently disabled.</p></section>;
  }

  if (!state.has_notes && state.analysis === null) {
    return <section className="analysis-panel analysis-state" aria-labelledby="analysis-heading"><h2 id="analysis-heading">AI note analysis</h2><p>Add a Note in at least one category to analyse today’s reflections.</p><p className="analysis-local-note">Analysis runs through your local GrowthSpace API and local Ollama service.</p></section>;
  }

  const analysis = state.analysis;

  return (
    <section className="analysis-panel" aria-labelledby="analysis-heading">
      <div className="analysis-heading-row">
        <div><p className="eyebrow">Local AI reflection</p><h2 id="analysis-heading">AI note analysis</h2><p>GrowthSpace combines your nonblank Notes and sends them to Ollama running locally on your computer.</p></div>
        {analysis && <span className={`analysis-status ${analysis.status}`}>{analysis.status}</span>}
      </div>

      {state.is_outdated && <div className="analysis-warning" role="status"><strong>Your Notes have changed.</strong><span>Reanalyse to create a reflection from the latest text.</span></div>}
      {hasError && <div className="analysis-error" role="alert"><strong>The analysis request failed.</strong><p>Please check that the local AI service is available and try again.</p><button type="button" disabled={busyAction !== ""} onClick={() => failedAction.current && void perform("Retrying", failedAction.current)}>Retry</button></div>}

      {!analysis && (
        <div className="analysis-call-to-action"><p>Ready when you are. Analysis never starts automatically.</p><button type="button" disabled={busyAction !== ""} onClick={() => void perform("Analysing", () => generateNoteAnalysis(accessToken, localDate))}>{busyAction === "Analysing" ? "Analysing…" : "Analyse today’s notes"}</button></div>
      )}

      {analysis && !isEditing && (
        <>
          <div className="analysis-results">
            <AnalysisSection title="Summary" text={analysis.summary} />
            <AnalysisList title="Positive actions" items={analysis.positive_actions} />
            <AnalysisList title="Challenges" items={analysis.challenges} />
            <AnalysisList title="Possible improvements" items={analysis.possible_improvements} />
            <AnalysisList title="Themes" items={analysis.themes} />
            <AnalysisSection title="Reflection question" text={analysis.reflection_question} accent />
          </div>
          <p className="analysis-notice">AI-generated reflection may be inaccurate. Review it before accepting.</p>
          <div className="analysis-actions">
            <button className="secondary-button" type="button" disabled={busyAction !== ""} onClick={() => { setEditDraft(toDraft(analysis)); setIsEditing(true); }}>Edit</button>
            <button type="button" disabled={busyAction !== "" || state.is_outdated} onClick={() => void perform("Accepting", () => acceptNoteAnalysis(accessToken, localDate))}>{busyAction === "Accepting" ? "Accepting…" : "Accept"}</button>
            <button className="secondary-button" type="button" disabled={busyAction !== ""} onClick={() => void perform("Rejecting", () => rejectNoteAnalysis(accessToken, localDate))}>{busyAction === "Rejecting" ? "Rejecting…" : "Reject"}</button>
            <button className="text-button" type="button" disabled={busyAction !== ""} onClick={() => analysis.status === "accepted" ? setConfirmReanalysis(true) : void perform("Reanalysing", () => generateNoteAnalysis(accessToken, localDate))}>{busyAction === "Reanalysing" ? "Reanalysing…" : "Reanalyse"}</button>
          </div>
        </>
      )}

      {confirmReanalysis && analysis?.status === "accepted" && <div className="reanalysis-confirmation" role="alertdialog" aria-labelledby="reanalysis-heading"><strong id="reanalysis-heading">Replace the accepted analysis?</strong><p>The accepted version will be replaced by a new draft.</p><div><button className="secondary-button" type="button" onClick={() => setConfirmReanalysis(false)}>Cancel</button><button type="button" onClick={() => void perform("Reanalysing", () => generateNoteAnalysis(accessToken, localDate, true))}>Confirm reanalysis</button></div></div>}

      {analysis && isEditing && editDraft && <AnalysisEditForm draft={editDraft} busy={busyAction !== ""} onChange={setEditDraft} onCancel={() => setIsEditing(false)} onSubmit={saveEdit} />}
    </section>
  );
}

function AnalysisSection({ title, text, accent = false }: { title: string; text: string; accent?: boolean }) {
  return <section className={accent ? "analysis-result accent" : "analysis-result"}><h3>{title}</h3><p>{text}</p></section>;
}

function AnalysisList({ title, items }: { title: string; items: string[] }) {
  return <section className="analysis-result"><h3>{title}</h3>{items.length > 0 ? <ul>{items.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>No evidence in today’s Notes.</p>}</section>;
}

function AnalysisEditForm({ draft, busy, onChange, onCancel, onSubmit }: { draft: EditDraft; busy: boolean; onChange: (draft: EditDraft) => void; onCancel: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void }) {
  const fields: Array<{ key: keyof EditDraft; label: string; help?: string; maxLength: number }> = [
    { key: "summary", label: "Summary", maxLength: 1200 },
    { key: "positiveActions", label: "Positive actions", help: "One item per line, up to 8.", maxLength: 3200 },
    { key: "challenges", label: "Challenges", help: "One item per line, up to 8.", maxLength: 3200 },
    { key: "possibleImprovements", label: "Possible improvements", help: "One item per line, up to 8.", maxLength: 3200 },
    { key: "themes", label: "Themes", help: "One item per line, up to 8.", maxLength: 3200 },
    { key: "reflectionQuestion", label: "Reflection question", maxLength: 600 },
  ];
  return <form className="analysis-edit-form" onSubmit={onSubmit}><h3>Edit reflection</h3>{fields.map((field) => <label key={field.key}>{field.label}{field.help && <span>{field.help}</span>}<textarea required={field.key === "summary" || field.key === "reflectionQuestion"} rows={field.key === "summary" ? 4 : 3} maxLength={field.maxLength} value={draft[field.key]} onChange={(event) => onChange({ ...draft, [field.key]: event.target.value })} /></label>)}<div><button className="secondary-button" type="button" disabled={busy} onClick={onCancel}>Cancel</button><button type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div></form>;
}
