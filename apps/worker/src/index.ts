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
const ALLOWED_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  ...(process.env.WEB_ORIGIN ? [process.env.WEB_ORIGIN] : []),
];
app.use(
  "*",
  cors({
    origin: (origin) => {
      if (!origin) return origin;
      if (ALLOWED_ORIGINS.includes(origin)) return origin;
      // Allow any *.vercel.app preview/prod by default — tighten via WEB_ORIGIN if needed.
      if (/^https:\/\/[\w.-]+\.vercel\.app$/.test(origin)) return origin;
      return null;
    },
  })
);

// Optional bearer-token auth. Set WORKER_TOKEN on the worker AND on the web app
// (same value) to protect the public worker URL. /health is always open.
const WORKER_TOKEN = process.env.WORKER_TOKEN;
app.use("*", async (c, next) => {
  if (!WORKER_TOKEN) return next();
  if (c.req.path === "/health") return next();
  const auth = c.req.header("authorization") || "";
  if (auth === `Bearer ${WORKER_TOKEN}`) return next();
  return c.json({ error: "unauthorized" }, 401);
});

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

app.get("/analytics", (c) => {
  const sqlite = getSqlite();
  const byResume = sqlite.prepare(`
    SELECT resume_key,
      COUNT(*) AS total,
      SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS submitted,
      SUM(CASE WHEN status='replied' OR status='interview' THEN 1 ELSE 0 END) AS replied,
      SUM(CASE WHEN status='interview' THEN 1 ELSE 0 END) AS interview
    FROM applications
    GROUP BY resume_key
  `).all();

  const tod = sqlite.prepare(`
    SELECT
      strftime('%H', datetime(submitted_at/1000, 'unixepoch', 'localtime')) AS hour,
      COUNT(*) AS sent,
      SUM(CASE WHEN status='replied' OR status='interview' THEN 1 ELSE 0 END) AS replied
    FROM applications
    WHERE submitted_at IS NOT NULL
    GROUP BY hour
    ORDER BY hour
  `).all();

  const days = sqlite.prepare(`
    SELECT
      date(datetime(submitted_at/1000, 'unixepoch', 'localtime')) AS day,
      COUNT(*) AS n
    FROM applications WHERE submitted_at IS NOT NULL
    GROUP BY day ORDER BY day
  `).all();

  return c.json({ byResume, tod, days });
});

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

app.get("/settings", (c) => {
  const sqlite = getSqlite();
  const bank = sqlite.prepare("SELECT key, value FROM question_bank").all() as any[];
  const filters = sqlite.prepare("SELECT * FROM search_filters WHERE active = 1 ORDER BY id DESC LIMIT 1").get() as any;
  const settingsRows = sqlite.prepare("SELECT key, value FROM settings").all() as any[];
  const settings = Object.fromEntries(settingsRows.map((r) => [r.key, JSON.parse(r.value)]));
  return c.json({
    bank: Object.fromEntries(bank.map((r) => [r.key, r.value])),
    filters: filters
      ? {
          keywords: JSON.parse(filters.keywords),
          locations: JSON.parse(filters.locations),
          remote: !!filters.remote,
          postedDays: filters.posted_within_days,
          exclusions: JSON.parse(filters.exclusions),
        }
      : null,
    settings,
  });
});

app.post("/settings", async (c) => {
  const body = await c.req.json();
  for (const [k, v] of Object.entries(body)) Settings.set(k, v);
  return c.json({ ok: true });
});

app.post("/onboarding/complete", async (c) => {
  const body = await c.req.json();
  const sqlite = getSqlite();
  const upsert = sqlite.prepare(
    `INSERT INTO question_bank (key, value, ts) VALUES (?, ?, unixepoch()*1000)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, ts=excluded.ts`
  );
  for (const [k, v] of Object.entries(body.bank ?? {})) upsert.run(k, String(v));
  sqlite.prepare("UPDATE search_filters SET active = 0").run();
  sqlite.prepare(
    `INSERT INTO search_filters (keywords, locations, remote, posted_within_days, exclusions, active)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(
    JSON.stringify(body.keywords ?? []),
    JSON.stringify(body.locations ?? []),
    body.remote ? 1 : 0,
    Number(body.postedDays ?? 7),
    JSON.stringify(body.exclusions ?? [])
  );
  Settings.set("onboarded", true);
  Settings.set("shadow_started_at", Date.now());
  Settings.set("mode", "shadow");
  return c.json({ ok: true });
});

app.get("/screenshot/:id", async (c) => {
  const id = c.req.param("id");
  const { readFile } = await import("node:fs/promises");
  const file = path.resolve(__dirname_, "../../..", ".pookie/screenshots", id, "screenshot.png");
  try {
    const buf = await readFile(file);
    return new Response(buf, { headers: { "Content-Type": "image/png", "Cache-Control": "no-store" } });
  } catch {
    return c.json({ error: "not found" }, 404);
  }
});

app.post("/parse-resumes", async (c) => {
  const { spawn } = await import("node:child_process");
  return new Promise<Response>((resolve) => {
    const proc = spawn("pnpm", ["--filter", "@pookie/profile", "parse"], {
      cwd: path.resolve(__dirname_, "../../.."),
      env: process.env,
    });
    let stdout = ""; let stderr = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.stderr.on("data", (b) => (stderr += b.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(new Response(JSON.stringify({ ok: true, stdout }), { headers: { "Content-Type": "application/json" } }));
      else resolve(new Response(JSON.stringify({ error: stderr || stdout || `exit ${code}` }), { status: 500, headers: { "Content-Type": "application/json" } }));
    });
  });
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
