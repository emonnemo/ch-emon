export interface UserPreferences {
  show_pinyin?: boolean;
  font_size_idx?: number;
  tone_colors?: boolean;
  tts_rate?: number;
  tts_voice_uri?: string | null;
  tts_autoplay_review?: boolean;
  [key: string]: unknown;
}

export interface User {
  id: number;
  email: string;
  name: string;
  preferences: UserPreferences;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface DictionaryEntry {
  id: number;
  simplified: string;
  traditional: string;
  pinyin_num: string;
  pinyin_marks: string;
  definitions: string[];
  is_proper_noun: boolean;
}

export interface Token {
  t: string;
  p?: string;
  d?: number[];
  w?: boolean;
}

export interface SectionSummary {
  section_index: number;
  title: string | null;
  char_count: number;
}

export interface DocumentSummary {
  id: number;
  title: string;
  source_type: "text" | "pdf" | "epub" | string;
  status: "processing" | "ready" | "failed" | string;
  progress_percent: number;
  error_message: string | null;
  total_chars: number;
  section_count: number;
  last_section_index: number;
  created_at: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentSummary {
  sections: SectionSummary[];
}

export interface DocumentSection {
  document_id: number;
  document_title: string;
  section_index: number;
  section_count: number;
  title: string | null;
  char_count: number;
  tokens: Token[][];
  dictionary: Record<string, DictionaryEntry>;
}

export interface VocabItem {
  id: number;
  word: string;
  pinyin: string;
  meaning: string;
  notes: string | null;
  example_sentence: string | null;
  example_translation: string | null;
  source_document_id: number | null;
  state: "new" | "learning" | "review" | "relearning" | string;
  reps: number;
  lapses: number;
  due_at: string;
  created_at: string;
  updated_at: string;
}

export interface TranslateResponse {
  source_text: string;
  translated_text: string;
  cached: boolean;
}

export interface VocabWordRef {
  id: number;
  word: string;
}

export interface DueCard extends VocabItem {
  interval_previews: Record<string, string>;
}

export interface ReviewResult {
  vocab: VocabItem;
  next_interval: string;
}

export interface ReviewStats {
  total_vocab: number;
  due_now: number;
  reviewed_today: number;
  new_count: number;
  learning_count: number;
  review_count: number;
}

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const TOKEN_KEY = "chemon_access_token";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(TOKEN_KEY);
  }
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function parseError(res: Response): Promise<string> {
  let detail = `Request failed (${res.status})`;
  try {
    const body = await res.json();
    if (body?.detail) detail = String(body.detail);
  } catch {
    // ignore non-json bodies
  }
  return detail;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (!(init?.body instanceof FormData) && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });

  if (!res.ok) {
    const msg = await parseError(res);
    throw new ApiError(msg, res.status);
  }

  if (res.status === 204) {
    return undefined as T;
  }
  return (await res.json()) as T;
}

// --- Auth ---
export function registerAccount(
  name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ name, email, password }),
  });
}

export function loginAccount(
  email: string,
  password: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function getMe(): Promise<User> {
  return apiFetch<User>("/api/auth/me");
}

export function updateUserPreferences(
  preferences: UserPreferences
): Promise<User> {
  return apiFetch<User>("/api/auth/preferences", {
    method: "PATCH",
    body: JSON.stringify({ preferences }),
  });
}

// --- Documents ---
export function listDocuments(): Promise<DocumentSummary[]> {
  return apiFetch<DocumentSummary[]>("/api/documents");
}

export function createTextDocument(
  title: string,
  text: string
): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>("/api/documents/text", {
    method: "POST",
    body: JSON.stringify({ title, text }),
  });
}

export function uploadBookDocument(
  file: File,
  title?: string
): Promise<DocumentSummary> {
  const form = new FormData();
  form.append("file", file);
  if (title && title.trim()) {
    form.append("title", title.trim());
  }
  return apiFetch<DocumentSummary>("/api/documents/upload", {
    method: "POST",
    body: form,
  });
}

export function getDocument(id: number): Promise<DocumentDetail> {
  return apiFetch<DocumentDetail>(`/api/documents/${id}`);
}

export function renameDocument(
  id: number,
  title: string
): Promise<DocumentSummary> {
  return apiFetch<DocumentSummary>(`/api/documents/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ title }),
  });
}

export function getDocumentSection(
  documentId: number,
  sectionIndex: number
): Promise<DocumentSection> {
  return apiFetch<DocumentSection>(
    `/api/documents/${documentId}/sections/${sectionIndex}`
  );
}

export function updateDocumentProgress(
  documentId: number,
  lastSectionIndex: number
): Promise<DocumentSummary> {
  return apiFetch<DocumentSummary>(`/api/documents/${documentId}/progress`, {
    method: "PATCH",
    body: JSON.stringify({ last_section_index: lastSectionIndex }),
  });
}

export function deleteDocument(documentId: number): Promise<void> {
  return apiFetch<void>(`/api/documents/${documentId}`, {
    method: "DELETE",
  });
}

// --- Vocabulary ---
export function listVocab(q?: string, dueOnly = false): Promise<VocabItem[]> {
  const params = new URLSearchParams();
  if (q && q.trim()) params.set("q", q.trim());
  if (dueOnly) params.set("due_only", "true");
  const qs = params.toString();
  return apiFetch<VocabItem[]>(`/api/vocab${qs ? `?${qs}` : ""}`);
}

export function listSavedWordRefs(): Promise<VocabWordRef[]> {
  return apiFetch<VocabWordRef[]>("/api/vocab/words");
}

export function addVocab(payload: {
  word: string;
  pinyin: string;
  meaning: string;
  notes?: string;
  example_sentence?: string;
  example_translation?: string;
  source_document_id?: number;
}): Promise<VocabItem> {
  return apiFetch<VocabItem>("/api/vocab", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateVocab(
  vocabId: number,
  payload: {
    pinyin?: string;
    meaning?: string;
    notes?: string;
    example_sentence?: string;
    example_translation?: string;
  }
): Promise<VocabItem> {
  return apiFetch<VocabItem>(`/api/vocab/${vocabId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function translateText(text: string): Promise<TranslateResponse> {
  return apiFetch<TranslateResponse>("/api/translate", {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}

export function deleteVocab(vocabId: number): Promise<void> {
  return apiFetch<void>(`/api/vocab/${vocabId}`, {
    method: "DELETE",
  });
}

// --- SRS Reviews ---
export function getDueReviews(limit = 30): Promise<DueCard[]> {
  return apiFetch<DueCard[]>(`/api/reviews/due?limit=${limit}`);
}

export function submitReview(
  vocabId: number,
  rating: 1 | 2 | 3 | 4
): Promise<ReviewResult> {
  return apiFetch<ReviewResult>(`/api/reviews/${vocabId}`, {
    method: "POST",
    body: JSON.stringify({ rating }),
  });
}

export function getReviewStats(): Promise<ReviewStats> {
  return apiFetch<ReviewStats>("/api/reviews/stats");
}
