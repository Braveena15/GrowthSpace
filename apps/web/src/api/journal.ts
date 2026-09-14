const API_BASE_URL = "http://localhost:8000";
export type JournalEntry = { id: number; title: string | null; content: string; entry_date: string; entry_time: string; created_at: string; updated_at: string };
export type JournalList = { entries: JournalEntry[]; total: number; offset: number; limit: number };
export type JournalWrite = Pick<JournalEntry, "title" | "content" | "entry_date" | "entry_time">;
async function request<T>(path: string, token: string, init: RequestInit = {}): Promise<T> { const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error("Journal is temporarily unavailable. Please try again."); return response.status === 204 ? undefined as T : response.json() as Promise<T>; }
export function getJournalEntries(token: string, params: Record<string, string>, signal?: AbortSignal) { return request<JournalList>(`/api/journal/entries?${new URLSearchParams(params)}`, token, { signal }); }
export function createJournalEntry(token: string, data: JournalWrite) { return request<JournalEntry>("/api/journal/entries", token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function updateJournalEntry(token: string, id: number, data: Partial<JournalWrite>) { return request<JournalEntry>(`/api/journal/entries/${id}`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }); }
export function deleteJournalEntry(token: string, id: number) { return request<void>(`/api/journal/entries/${id}`, token, { method: "DELETE" }); }
