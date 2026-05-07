import pino from "pino";

export const log = pino({
  level: process.env.LOG_LEVEL ?? "info",
  transport: {
    target: "pino-pretty",
    options: { colorize: true, translateTime: "HH:MM:ss.l", ignore: "pid,hostname" },
  },
});

// Lightweight in-memory pub/sub for streaming logs to the web UI via SSE.
type Listener = (msg: string) => void;
const listeners = new Set<Listener>();

export function subscribe(fn: Listener) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function emit(kind: string, payload: Record<string, unknown> = {}) {
  const msg = JSON.stringify({ ts: Date.now(), kind, ...payload });
  for (const l of listeners) l(msg);
}
