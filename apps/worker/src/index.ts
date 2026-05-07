import { config as loadDotenv } from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname_ = path.dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: path.resolve(__dirname_, "../../../.env") });
import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { startQueueLoop, stopQueueLoop, enqueue } from "./queue.js";
import { ensureLoggedIn } from "./linkedin/login.js";
import { applyToJob } from "./linkedin/easy-apply.js";
import { closeContext } from "./stealth.js";
import { Settings, todayFunnel, weeklySparkline, lastApplications, awaitingReview, dailyAppCount } from "@pookie/db/queries.js";
import { getSqlite } from "@pookie/db";
import { log, subscribe } from "./log.js";

const app = new Hono();
app.use("*", cors({ origin: ["http://localhost:3000", "http://127.0.0.1:3000"] }));

app.get("/health", (c) => c.json({ ok: true, ts: Date.now() }));

app.get("/status", (c) => {
  return c.json({
    mode: Settings.get("mode", "shadow"),
    paused: Settings.get("paused", false),
    daily_cap: Settings.get("daily_cap", 22),
    daily_count: dailyAppCount(),
    onboarded: Settings.get("onboarded", false),
    session_logged_in: Settings.get("session_logged_in", false),
    shadow_started_at: Settings.get("shadow_started_at", null),
    shadow_approvals: Settings.get("shadow_approvals", 0),
  });
});

app.get("/dashboard", (c) => {
  return c.json({
    funnel: todayFunnel(),
    sparkline: weeklySparkline(),
    last: lastApplications(10),
    awaiting: awaitingReview().length,
  });
});

app.get("/awaiting", (c) => c.json(awaitingReview()));

app.post("/start", async (c) => {
  Settings.set("paused", false);
  startQueueLoop();
  return c.json({ ok: true });
});

app.post("/pause", async (c) => {
  Settings.set("paused", true);
  return c.json({ ok: true });
});

app.post("/resume", async (c) => {
  Settings.set("paused", false);
  return c.json({ ok: true });
});

app.post("/login", async (c) => {
  // Fire login flow non-blocking
  ensureLoggedIn().catch((e) => log.error({ err: e?.message }, "login flow error"));
  return c.json({ ok: true });
});

app.post("/discover", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  enqueue("discover", body);
  return c.json({ ok: true });
});

app.post("/apply", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body?.jobId) return c.json({ error: "jobId required" }, 400);
  enqueue("apply", { jobId: Number(body.jobId) });
  return c.json({ ok: true });
});

// Manually submit a shadow application (Marina clicks Submit from review page)
app.post("/applications/:id/submit", async (c) => {
  const id = Number(c.req.param("id"));
  const sqlite = getSqlite();
  // Mode flip: this submission goes through normally. We just rerun apply but we'll
  // detect the modal might already be closed. Simpler: mark as submitted and increment
  // shadow_approvals; the actual click was already done in shadow-mode preview.
  // For the v1 we instead re-open and run with mode='auto' for this single job.
  const app = sqlite.prepare("SELECT job_id FROM applications WHERE id = ?").get(id) as any;
  if (!app) return c.json({ error: "not found" }, 404);
  // Force-flip mode for this single run: temporarily set mode to auto, run apply, then restore.
  const prev = Settings.get<string>("mode", "shadow");
  Settings.set("mode", "auto");
  try {
    await applyToJob({ jobId: app.job_id });
    // Increment shadow approvals
    const cur = Settings.get<number>("shadow_approvals", 0);
    Settings.set("shadow_approvals", cur + 1);
  } finally {
    Settings.set("mode", prev);
  }
  return c.json({ ok: true });
});

app.post("/applications/:id/skip", async (c) => {
  const id = Number(c.req.param("id"));
  getSqlite().prepare("UPDATE applications SET status='skipped' WHERE id = ?").run(id);
  return c.json({ ok: true });
});

app.post("/mode", async (c) => {
  const { mode } = await c.req.json();
  if (!["shadow", "auto"].includes(mode)) return c.json({ error: "invalid mode" }, 400);
  Settings.set("mode", mode);
  if (mode === "auto" && !Settings.get("shadow_started_at", null)) {
    Settings.set("shadow_started_at", Date.now());
  }
  return c.json({ ok: true });
});

// Server-Sent Events stream of worker activity
app.get("/stream", (c) => {
  return new Response(
    new ReadableStream({
      start(controller) {
        const enc = new TextEncoder();
        const send = (msg: string) => controller.enqueue(enc.encode(`data: ${msg}\n\n`));
        send(JSON.stringify({ kind: "hello", ts: Date.now() }));
        const unsub = subscribe(send);
        const ping = setInterval(() => send(JSON.stringify({ kind: "ping", ts: Date.now() })), 15000);
        const onClose = () => {
          clearInterval(ping);
          unsub();
          try { controller.close(); } catch {}
        };
        // @ts-expect-error - close handler
        c.req.raw?.signal?.addEventListener?.("abort", onClose);
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
      },
    }
  );
});

const port = Number(process.env.WORKER_PORT ?? 3001);
serve({ fetch: app.fetch, port });
log.info({ port }, "worker http server ready");

// Auto-start the queue loop when worker boots
startQueueLoop();

process.on("SIGINT", async () => {
  log.info("shutting down…");
  stopQueueLoop();
  await closeContext();
  process.exit(0);
});
