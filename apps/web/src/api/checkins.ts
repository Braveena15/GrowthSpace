const API_BASE_URL = "http://localhost:8000";

export type CheckInQuestion = {
  key: string;
  category: string;
  subcategory: string;
  text: string;
  kind: "rating" | "duration" | "integer" | "number" | "choice";
  required: boolean;
  minimum: number | null;
  maximum: number | null;
  choices: string[];
  scale_labels: string[];
};

export type CheckInAnswer = {
  question_key: string;
  numeric_value: number | null;
  choice_value: string | null;
};

export type CheckIn = {
  id: number;
  local_date: string;
  question_set_version: string;
  status: "draft" | "submitted";
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  answers: CheckInAnswer[];
  notes: { category: string; note: string }[];
  naps: { position: number; duration_minutes: number }[];
  responsibilities: { position: number; description: string }[];
  total_nap_minutes: number;
  total_daily_sleep_minutes: number | null;
  responsibility_count: number;
};

export type QuestionSet = {
  local_date: string;
  version: string;
  questions: CheckInQuestion[];
};

async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error("Your check-in could not be saved. Please try again.");
  }
  return response.json() as Promise<T>;
}

export const getCheckInQuestions = (token: string, localDate: string) =>
  request<QuestionSet>(`/api/check-ins/questions?local_date=${localDate}`, token);

export const openCheckIn = (token: string, localDate: string) =>
  request<CheckIn>(`/api/check-ins/${localDate}`, token, { method: "PUT" });

export const saveCheckInAnswer = (token: string, localDate: string, answer: CheckInAnswer) =>
  request<CheckIn>(`/api/check-ins/${localDate}/answers`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answer),
  });

export const clearCheckInAnswer = (token: string, localDate: string, questionKey: string) =>
  request<CheckIn>(`/api/check-ins/${localDate}/answers/${questionKey}`, token, { method: "DELETE" });

export const saveCheckInNote = (token: string, localDate: string, category: string, note: string) =>
  request<CheckIn>(`/api/check-ins/${localDate}/notes`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ category, note }),
  });

export const saveCheckInNaps = (token: string, localDate: string, durationsMinutes: number[]) =>
  request<CheckIn>(`/api/check-ins/${localDate}/naps`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ durations_minutes: durationsMinutes }),
  });

export const saveCheckInResponsibilities = (token: string, localDate: string, items: string[]) =>
  request<CheckIn>(`/api/check-ins/${localDate}/responsibilities`, token, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });

export const submitCheckIn = (token: string, localDate: string) =>
  request<CheckIn>(`/api/check-ins/${localDate}/submit`, token, { method: "POST" });
