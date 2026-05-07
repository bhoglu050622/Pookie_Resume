// Server-side fetcher to the worker HTTP API.
const PORT = process.env.WORKER_PORT ?? "3001";
const BASE = `http://127.0.0.1:${PORT}`;

export const worker = {
  base: BASE,
  async json<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(BASE + path, {
      cache: "no-store",
      headers: { "Content-Type": "application/json", ...(init.headers || {}) },
      ...init,
    });
    if (!res.ok) throw new Error(`worker ${path} -> ${res.status}`);
    return (await res.json()) as T;
  },
  status: () => worker.json<any>("/status"),
  dashboard: () => worker.json<any>("/dashboard"),
  awaiting: () => worker.json<any[]>("/awaiting"),
  start: () => worker.json<any>("/start", { method: "POST" }),
  pause: () => worker.json<any>("/pause", { method: "POST" }),
  login: () => worker.json<any>("/login", { method: "POST" }),
  discover: (body: any) => worker.json<any>("/discover", { method: "POST", body: JSON.stringify(body) }),
  setMode: (mode: "shadow" | "auto") => worker.json<any>("/mode", { method: "POST", body: JSON.stringify({ mode }) }),
  submitApplication: (id: number) => worker.json<any>(`/applications/${id}/submit`, { method: "POST" }),
  skipApplication: (id: number) => worker.json<any>(`/applications/${id}/skip`, { method: "POST" }),
};
