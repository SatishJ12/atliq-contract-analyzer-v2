import type { Draft, Health, Mode, QueueRow, RegisterEntry, Report } from "./types";

const STORAGE_KEY = "atliq.apiUrl";
const TOKEN_KEY = "atliq.accessToken";
/** Saved in place of a URL when the user explicitly picks the offline demo. */
export const DEMO_SENTINEL = "demo";
const DEMO_BASE = `${import.meta.env.BASE_URL}demo`;

function stored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked
  }
}

function store(key: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

/** What the Settings box shows: a saved override, else the build's VITE_API_URL. */
export function getApiUrl(): string {
  return stored(STORAGE_KEY) ?? ((import.meta.env.VITE_API_URL as string | undefined) ?? "");
}

/** The backend to call, or "" for the offline demo. */
export function resolveApiUrl(): string {
  const url = getApiUrl();
  return url === DEMO_SENTINEL ? "" : url;
}

/** Empty clears the override (back to the build's URL); "demo" forces the offline demo. */
export function setApiUrl(url: string) {
  const clean = url.trim().replace(/\/$/, "");
  store(STORAGE_KEY, clean ? clean : null);
}

export function getAccessToken(): string {
  return stored(TOKEN_KEY) ?? "";
}

export function setAccessToken(token: string) {
  store(TOKEN_KEY, token.trim() || null);
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let msg = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (typeof body?.detail === "string") msg = body.detail;
      else if (Array.isArray(body?.detail) && body.detail[0]?.msg) msg = `Request rejected: ${body.detail[0].msg}`;
      else if (body?.detail) msg = JSON.stringify(body.detail);
    } catch {
      /* not JSON */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

/** Live client talks to the FastAPI backend; demo client reads the static JSON exported by backend/export_demo.py. */
export interface Client {
  live: boolean;
  health(): Promise<Health>;
  drafts(): Promise<Draft[]>;
  analyzeDraft(filename: string, mode: Mode, signal?: AbortSignal): Promise<Report>;
  analyzeText(text: string, filename: string, mode: Mode, signal?: AbortSignal): Promise<Report>;
  analyzeFile(file: File, mode: Mode, signal?: AbortSignal): Promise<Report>;
  ask(question: string, target: { draft?: string; text?: string; filename?: string }): Promise<string>;
  register(): Promise<RegisterEntry[]>;
  queue(): Promise<QueueRow[]>;
}

export function liveClient(base: string): Client {
  const url = (p: string) => `${base}/api${p}`;
  const auth = (): Record<string, string> => {
    const token = getAccessToken();
    return token ? { "X-Access-Token": token } : {};
  };
  const post = (p: string, body: unknown, signal?: AbortSignal) =>
    fetch(url(p), { method: "POST", headers: { "Content-Type": "application/json", ...auth() }, body: JSON.stringify(body), signal });
  return {
    live: true,
    health: () => fetch(url("/health")).then(json<Health>),
    drafts: () => fetch(url("/drafts")).then(json<Draft[]>),
    analyzeDraft: (draft, mode, signal) => post("/analyze", { draft, mode }, signal).then(json<Report>),
    analyzeText: (text, filename, mode, signal) => post("/analyze", { text, filename, mode }, signal).then(json<Report>),
    analyzeFile: (file, mode, signal) => {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", mode);
      return fetch(url("/analyze/upload"), { method: "POST", headers: auth(), body: form, signal }).then(json<Report>);
    },
    ask: (question, target) => post("/ask", { question, ...target }).then(json<{ answer: string }>).then((r) => r.answer),
    register: () => fetch(url("/register")).then(json<RegisterEntry[]>),
    queue: () => fetch(url("/queue")).then(json<QueueRow[]>),
  };
}

const needsBackend = () => Promise.reject(new Error("This needs the live backend. The demo only covers the 15 incoming drafts."));

export const demoClient: Client = {
  live: false,
  health: () => fetch(`${DEMO_BASE}/health.json`).then(json<Health>),
  drafts: () => fetch(`${DEMO_BASE}/drafts.json`).then(json<Draft[]>),
  analyzeDraft: (filename, _mode, signal) =>
    fetch(`${DEMO_BASE}/reports/${filename.replace(/\.[^.]+$/, "")}.json`, { signal }).then(json<Report>),
  analyzeText: needsBackend,
  analyzeFile: needsBackend,
  ask: needsBackend,
  register: () => fetch(`${DEMO_BASE}/register.json`).then(json<RegisterEntry[]>),
  queue: () => fetch(`${DEMO_BASE}/queue.json`).then(json<QueueRow[]>),
};

/** Use the backend when one is configured and answering; otherwise fall back to the offline demo. */
export async function connect(): Promise<{ client: Client; health: Health; fallbackReason?: string }> {
  const base = resolveApiUrl();
  if (base) {
    const live = liveClient(base);
    try {
      const health = await Promise.race([
        live.health(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), 60000)),
      ]);
      return { client: live, health };
    } catch (e) {
      const health = await demoClient.health();
      return { client: demoClient, health, fallbackReason: `Backend at ${base} is not reachable (${(e as Error).message}). Showing the offline demo.` };
    }
  }
  return { client: demoClient, health: await demoClient.health() };
}
