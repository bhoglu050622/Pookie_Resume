// Server-side fetcher to the worker HTTP API.
// Dev: WORKER_PORT=3001 → http://127.0.0.1:3001
// Prod: set WORKER_URL to the deployed worker (e.g. https://pookie-worker.up.railway.app)
const BASE = process.env.WORKER_URL
  ? process.env.WORKER_URL.replace(/\/$/, "")
  : `http://127.0.0.1:${process.env.WORKER_PORT ?? "3001"}`;

const TIMEOUT_MS = Number(process.env.WORKER_TIMEOUT_MS ?? 8000);

export const worker = {
  base: BASE,
  async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BASE + path, {
        cache: "no-store",
        signal: ctrl.signal,
        headers: {
          "Content-Type": "application/json",
          ...(process.env.WORKER_TOKEN ? { Authorization: `Bearer ${process.env.WORKER_TOKEN}` } : {}),
          ...(init.headers || {}),
        },
        ...init,
      });
      if (!res.ok) throw new Error(`worker ${path} -> ${res.status}`);
      return (await res.json()) as T;
    } finally {
      clearTimeout(t);
    }
  },
  status: () => worker.json<any>("/status"),
  dashboard: () => worker.json<any>("/dashboard"),
  awaiting: () => worker.json<any[]>("/awaiting"),
  analytics: () => worker.json<{ byResume: any[]; tod: any[]; days: any[] }>("/analytics"),
  getSettings: () => worker.json<any>("/settings"),
  setSettings: (body: any) => worker.json<any>("/settings", { method: "POST", body: JSON.stringify(body) }),
  completeOnboarding: (body: any) => worker.json<any>("/onboarding/complete", { method: "POST", body: JSON.stringify(body) }),
  parseResumes: () => worker.json<any>("/parse-resumes", { method: "POST" }),
  start: () => worker.json<any>("/start", { method: "POST" }),
  pause: () => worker.json<any>("/pause", { method: "POST" }),
  login: () => worker.json<any>("/login", { method: "POST" }),
  loginCookies: (cookies: any[]) => worker.json<{ ok: boolean; count: number; signed_in: boolean; landed_on?: string }>(
    "/login/cookies",
    { method: "POST", body: JSON.stringify({ cookies }) }
  ),
  discover: (body: any) => worker.json<any>("/discover", { method: "POST", body: JSON.stringify(body) }),
  setMode: (mode: "shadow" | "auto") => worker.json<any>("/mode", { method: "POST", body: JSON.stringify({ mode }) }),
  submitApplication: (id: number) => worker.json<any>(`/applications/${id}/submit`, { method: "POST" }),
  skipApplication: (id: number) => worker.json<any>(`/applications/${id}/skip`, { method: "POST" }),
};
