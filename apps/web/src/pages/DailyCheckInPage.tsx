import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  CheckInAnswer,
  CheckInQuestion,
  clearCheckInAnswer,
  getCheckInQuestions,
  openCheckIn,
  saveCheckInAnswer,
  saveCheckInNaps,
  saveCheckInNote,
  saveCheckInResponsibilities,
  submitCheckIn,
} from "../api/checkins";
import { DurationPicker } from "../components/checkin/DurationPicker";
import { RatingScale } from "../components/checkin/RatingScale";
import { SegmentedChoice } from "../components/checkin/SegmentedChoice";
import { useAutosaveQueue } from "../hooks/useAutosaveQueue";
import { formatDuration, formatLocalDateKey } from "../utils/checkins";

const categories = [
  "Mental and emotional health",
  "Character and maturity",
  "Career",
  "Communication",
  "Physical health",
  "Skin and body care",
  "Discipline and digital wellbeing",
  "Independence and finances",
];

type PageState = "loading" | "ready" | "error" | "submitted";

function answerValue(answer: CheckInAnswer | undefined): number | string | null {
  return answer?.choice_value ?? answer?.numeric_value ?? null;
}

export function DailyCheckInPage({ accessToken }: { accessToken: string }) {
  const localDate = formatLocalDateKey(new Date());
  const [questions, setQuestions] = useState<CheckInQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, CheckInAnswer>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [naps, setNaps] = useState<Array<number | null>>([]);
  const [responsibilities, setResponsibilities] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [pageState, setPageState] = useState<PageState>("loading");
  const [validationMessage, setValidationMessage] = useState("");
  const autosave = useAutosaveQueue();

  useEffect(() => {
    let alive = true;
    Promise.all([
      getCheckInQuestions(accessToken, localDate),
      openCheckIn(accessToken, localDate),
    ])
      .then(([questionSet, checkIn]) => {
        if (!alive) return;
        setQuestions(questionSet.questions);
        setAnswers(Object.fromEntries(checkIn.answers.map((answer) => [answer.question_key, answer])));
        setNotes(Object.fromEntries(checkIn.notes.map((note) => [note.category, note.note])));
        setNaps(checkIn.naps.map((nap) => nap.duration_minutes));
        setResponsibilities(checkIn.responsibilities.map((item) => item.description));
        setPageState("ready");
      })
      .catch(() => alive && setPageState("error"));
    return () => { alive = false; };
  }, [accessToken, localDate]);

  const category = categories[step];
  const visible = useMemo(
    () => questions.filter((question) => question.category === category),
    [questions, category],
  );
  const daytimeSleep = answers.P3?.choice_value;
  const responsibilityAnswer = answers.I1?.choice_value;
  const nightSleepMinutes = answers.P1M?.numeric_value ?? null;
  const validNapTotal = naps.reduce<number>((total, nap) => total + (nap ?? 0), 0);

  function scheduleAnswer(question: CheckInQuestion, value: number | string | null) {
    setValidationMessage("");
    if (value === null) {
      setAnswers((current) => {
        const next = { ...current };
        delete next[question.key];
        return next;
      });
      if (question.key === "P3") setNaps([]);
      if (question.key === "I1") setResponsibilities([]);
      autosave.schedule(`answer:${question.key}`, () => clearCheckInAnswer(accessToken, localDate, question.key));
      return;
    }

    const answer: CheckInAnswer = typeof value === "number"
      ? { question_key: question.key, numeric_value: value, choice_value: null }
      : { question_key: question.key, numeric_value: null, choice_value: value };
    setAnswers((current) => ({ ...current, [question.key]: answer }));
    if (question.key === "P3") {
      if (value === "Yes" && naps.length === 0) setNaps([null]);
      if (value === "No") setNaps([]);
    }
    if (question.key === "I1") {
      if (value === "Yes" && responsibilities.length === 0) setResponsibilities([""]);
      if (value === "No" || value === "N/A") setResponsibilities([]);
    }
    autosave.schedule(`answer:${question.key}`, () => saveCheckInAnswer(accessToken, localDate, answer));
  }

  function updateNaps(next: Array<number | null>) {
    setNaps(next);
    autosave.schedule("naps", () => saveCheckInNaps(accessToken, localDate, next.filter((duration): duration is number => duration !== null)));
  }

  function updateResponsibilities(next: string[]) {
    setResponsibilities(next);
    autosave.schedule("responsibilities", () => saveCheckInResponsibilities(accessToken, localDate, next.filter((item) => item.trim() !== "")));
  }

  function updateNote(note: string) {
    setNotes((current) => ({ ...current, [category]: note }));
    autosave.schedule(`note:${category}`, () => saveCheckInNote(accessToken, localDate, category, note));
  }

  function categoryIsComplete(): boolean {
    if (!visible.every((question) => answers[question.key] !== undefined)) return false;
    if (category === "Physical health" && daytimeSleep === "Yes") {
      if (naps.length === 0 || naps.some((nap) => nap === null || nap <= 0)) return false;
      if ((nightSleepMinutes ?? 0) + validNapTotal > 1440) return false;
    }
    if (category === "Independence and finances" && responsibilityAnswer === "Yes") {
      if (responsibilities.length === 0 || responsibilities.some((item) => item.trim() === "")) return false;
    }
    return true;
  }

  async function moveTo(nextStep: number) {
    if (nextStep > step && !categoryIsComplete()) {
      setValidationMessage("Complete every required answer in this category before continuing.");
      const firstMissing = visible.find((question) => answers[question.key] === undefined);
      document.getElementById(firstMissing?.key ?? `${category === "Physical health" ? "nap-1" : "responsibility-1"}`)?.focus();
      return;
    }
    setValidationMessage("");
    if (!(await autosave.flush())) return;
    setStep(nextStep);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit() {
    setValidationMessage("");
    if (!(await autosave.flush())) return;
    try {
      await submitCheckIn(accessToken, localDate);
      setPageState("submitted");
    } catch {
      setValidationMessage("The check-in could not be submitted. Review the required answers and try again.");
    }
  }

  if (pageState === "loading") {
    return <div className="modern-state" role="status"><span className="loading-orbit" aria-hidden="true" />Loading your check-in…</div>;
  }
  if (pageState === "error") {
    return <div className="modern-state error" role="alert"><strong>We couldn’t load today’s check-in.</strong><span>Refresh the page when you’re ready to try again.</span></div>;
  }
  if (pageState === "submitted") {
    return <section className="page checkin-page checkin-success"><div className="success-mark" aria-hidden="true">✓</div><p className="eyebrow">All done</p><h1>Check-in submitted</h1><p>Your answers are safely recorded. You can revisit today’s check-in if something changes.</p><Link to="/">Return home</Link></section>;
  }

  const saveLabel = autosave.status === "saving" ? "Saving…" : autosave.status === "error" ? "Couldn’t save — Retry" : "Saved just now";

  if (step === categories.length) {
    return (
      <section className="page checkin-page" aria-labelledby="review-heading">
        <CheckInHeader step={step} saveLabel={saveLabel} saveError={autosave.status === "error"} onRetry={autosave.retry} />
        <div className="checkin-title-block"><p className="eyebrow">Review and submit</p><h1 id="review-heading">Review your day</h1><p>Take a final look. You can return to any category before submitting.</p></div>
        <div className="review-grid">
          {categories.map((name, index) => (
            <section className="review-card" key={name}>
              <div className="review-card-heading"><h2>{name}</h2><button className="clear-control" type="button" onClick={() => void moveTo(index)}>Edit</button></div>
              {questions.filter((question) => question.category === name).map((question) => (
                <div className="review-answer" key={question.key}><span>{question.text}</span><strong>{formatAnswer(question, answers[question.key])}</strong></div>
              ))}
              {name === "Physical health" && daytimeSleep === "Yes" && <div className="review-answer"><span>Total daily sleep</span><strong>{formatDuration((nightSleepMinutes ?? 0) + validNapTotal)}</strong></div>}
              {name === "Independence and finances" && responsibilityAnswer === "Yes" && <div className="review-answer"><span>Responsibilities completed</span><strong>{responsibilities.filter((item) => item.trim()).length}</strong></div>}
              {notes[name] && <p className="review-note"><span>Note</span>{notes[name]}</p>}
            </section>
          ))}
        </div>
        {validationMessage && <p className="form-error" role="alert">{validationMessage}</p>}
        <div className="checkin-actions"><button className="secondary-button" type="button" onClick={() => void moveTo(categories.length - 1)}>Back</button><button type="button" onClick={() => void handleSubmit()}>Submit check-in</button></div>
      </section>
    );
  }

  const subcategories = Array.from(new Set(visible.map((question) => question.subcategory)));

  return (
    <section className="page checkin-page" aria-labelledby="checkin-heading">
      <CheckInHeader step={step} saveLabel={saveLabel} saveError={autosave.status === "error"} onRetry={autosave.retry} />
      <div className="checkin-title-block"><p className="eyebrow">Daily reflection</p><h1 id="checkin-heading">{category}</h1><p>Answer honestly for yourself. Your progress saves automatically.</p></div>
      <div className="checkin-content">
        {subcategories.map((subcategory) => (
          <section className="question-section" aria-labelledby={`subcategory-${subcategory}`} key={subcategory}>
            <div className="subcategory-heading"><span aria-hidden="true" /><h2 id={`subcategory-${subcategory}`}>{subcategory}</h2></div>
            {visible.filter((question) => question.subcategory === subcategory).map((question) => (
              <QuestionControl key={question.key} question={question} answer={answers[question.key]} onChange={(value) => scheduleAnswer(question, value)} />
            ))}
            {subcategory === "Daytime sleep" && daytimeSleep === "Yes" && (
              <NapList naps={naps} nightSleepMinutes={nightSleepMinutes} onChange={updateNaps} />
            )}
            {subcategory === "Independent responsibility" && responsibilityAnswer === "Yes" && (
              <ResponsibilityList items={responsibilities} onChange={updateResponsibilities} />
            )}
          </section>
        ))}
        <div className="note-card">
          <label htmlFor="category-note">Note</label>
          <p className="field-hint" id="category-note-help">Add anything that may help you understand this day later.</p>
          <textarea id="category-note" aria-describedby="category-note-help" maxLength={2000} rows={4} value={notes[category] ?? ""} onChange={(event) => updateNote(event.target.value)} />
          <span className="character-count">{(notes[category] ?? "").length} / 2,000</span>
        </div>
      </div>
      {validationMessage && <p className="form-error checkin-validation" role="alert">{validationMessage}</p>}
      <div className="checkin-actions"><button className="secondary-button" type="button" disabled={step === 0} onClick={() => void moveTo(step - 1)}>Back</button><button type="button" onClick={() => void moveTo(step + 1)}>Next</button></div>
    </section>
  );
}

function CheckInHeader({ step, saveLabel, saveError, onRetry }: { step: number; saveLabel: string; saveError: boolean; onRetry: () => Promise<void> }) {
  return (
    <header className="checkin-header">
      <div className="checkin-header-row"><Link className="exit-checkin" to="/">← Exit check-in</Link><button className={saveError ? "save-indicator error" : "save-indicator"} type="button" disabled={!saveError} onClick={() => void onRetry()} aria-live="polite">{saveLabel}</button></div>
      <ol className="category-stepper" aria-label="Check-in progress">
        {categories.map((name, index) => <li key={name} className={index < step ? "complete" : index === step ? "current" : undefined}><span>{index < step ? "✓" : index + 1}</span><small>{name}</small></li>)}
      </ol>
      <p className="mobile-progress">{step === categories.length ? "Review" : `Category ${step + 1} of ${categories.length}`}</p>
    </header>
  );
}

function QuestionControl({ question, answer, onChange }: { question: CheckInQuestion; answer?: CheckInAnswer; onChange: (value: number | string | null) => void }) {
  const value = answerValue(answer);
  if (question.kind === "rating") {
    return <RatingScale id={question.key} label={question.text} labels={question.scale_labels} value={typeof value === "number" || value === "N/A" ? value : null} allowNotApplicable={question.choices.includes("N/A")} onChange={onChange} />;
  }
  if (question.kind === "duration") {
    return <DurationPicker id={question.key} label={question.text} value={typeof value === "number" ? value : null} maxMinutes={question.maximum ?? 1440} onChange={onChange} />;
  }
  if (question.kind === "choice") {
    return <SegmentedChoice id={question.key} label={question.text} choices={question.choices} value={typeof value === "string" ? value : null} onChange={onChange} />;
  }
  return (
    <div className="question-card compact-question">
      <label htmlFor={question.key}>{question.text}</label>
      <div className="inline-number"><input id={question.key} type="number" min={question.minimum ?? undefined} max={question.maximum ?? undefined} step="1" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} /><span>minutes</span></div>
    </div>
  );
}

export function NapList({ naps, nightSleepMinutes, onChange }: { naps: Array<number | null>; nightSleepMinutes: number | null; onChange: (naps: Array<number | null>) => void }) {
  const napTotal = naps.reduce<number>((total, nap) => total + (nap ?? 0), 0);
  return (
    <div className="nested-list" aria-label="Daytime naps">
      {naps.map((nap, index) => (
        <div className="nested-item" key={index}>
          <DurationPicker id={`nap-${index + 1}`} label={`Nap ${index + 1}`} description="Each added nap must be longer than zero minutes." value={nap} maxMinutes={1440} onChange={(duration) => onChange(naps.map((item, itemIndex) => itemIndex === index ? duration : item))} />
          <button className="remove-link" type="button" onClick={() => onChange(naps.filter((_, itemIndex) => itemIndex !== index))}>Remove Nap {index + 1}</button>
        </div>
      ))}
      {naps.length < 10 && <button className="add-row-button" type="button" onClick={() => onChange([...naps, null])}>+ Add another nap</button>}
      <div className="calculated-summary"><span>Total nap duration</span><strong>{formatDuration(napTotal)}</strong><span>Total daily sleep</span><strong>{nightSleepMinutes === null ? "Add night sleep" : formatDuration(nightSleepMinutes + napTotal)}</strong></div>
    </div>
  );
}

export function ResponsibilityList({ items, onChange }: { items: string[]; onChange: (items: string[]) => void }) {
  const count = items.filter((item) => item.trim() !== "").length;
  return (
    <div className="nested-list" aria-label="Completed responsibilities">
      {items.map((item, index) => (
        <div className="responsibility-row" key={index}>
          <label htmlFor={`responsibility-${index + 1}`}>Responsibility {index + 1}</label>
          <div><input id={`responsibility-${index + 1}`} maxLength={200} value={item} onChange={(event) => onChange(items.map((current, itemIndex) => itemIndex === index ? event.target.value : current))} /><button className="remove-link" type="button" onClick={() => onChange(items.filter((_, itemIndex) => itemIndex !== index))}>Remove</button></div>
        </div>
      ))}
      {items.length < 10 && <button className="add-row-button" type="button" onClick={() => onChange([...items, ""])}>+ Add another responsibility</button>}
      <p className="calculated-count" aria-live="polite">{count} {count === 1 ? "responsibility" : "responsibilities"} completed.</p>
    </div>
  );
}

function formatAnswer(question: CheckInQuestion, answer: CheckInAnswer | undefined): string {
  const value = answerValue(answer);
  if (value === null) return "Not answered";
  if (question.kind === "duration" && typeof value === "number") return formatDuration(value);
  if (question.kind === "integer" && typeof value === "number") return `${value} minutes`;
  return String(value);
}
