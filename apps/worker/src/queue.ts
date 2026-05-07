import { getSqlite } from "@pookie/db";
import { discoverJobs } from "./linkedin/discover.js";
import { applyToJob } from "./linkedin/easy-apply.js";
import { ensureLoggedIn } from "./linkedin/login.js";
import { Settings } from "@pookie/db/queries.js";
import { log, emit } from "./log.js";

let _running = false;
let _loop: ReturnType<typeof setTimeout> | null = null;

export function startQueueLoop() {
  if (_running) return;
  _running = true;
  log.info("queue loop started");
  tick();
}

export function stopQueueLoop() {
  _running = false;
  if (_loop) clearTimeout(_loop);
  _loop = null;
  log.info("queue loop stopped");
}

async function tick() {
  if (!_running) return;
  try {
    const paused = Settings.get<boolean>("paused", false);
    if (paused) {
      _loop = setTimeout(tick, 5000);
      return;
    }

    const sqlite = getSqlite();
    const item = sqlite
      .prepare(`SELECT * FROM queue WHERE status='pending' AND next_run_at <= unixepoch()*1000 ORDER BY next_run_at ASC LIMIT 1`)
      .get() as any;

    if (!item) {
      // No queued work — schedule periodic discover if a search is active
      maybeEnqueueDiscover();
      _loop = setTimeout(tick, 3000);
      return;
    }

    sqlite.prepare(`UPDATE queue SET status='running', attempts=attempts+1 WHERE id=?`).run(item.id);
    emit("queue:run", { id: item.id, kind: item.kind });

    try {
      await runJob(item);
      sqlite.prepare(`UPDATE queue SET status='done' WHERE id=?`).run(item.id);
    } catch (e: any) {
      log.error({ err: e?.message, id: item.id, kind: item.kind }, "queue job failed");
      sqlite.prepare(`UPDATE queue SET status=?, last_error=?, next_run_at=? WHERE id=?`)
        .run(item.attempts >= 2 ? "failed" : "pending", String(e?.message ?? e), Date.now() + 60_000, item.id);
    }
  } catch (e) {
    log.error({ err: e }, "tick error");
  }
  _loop = setTimeout(tick, 1500);
}

async function runJob(item: any) {
  const payload = item.payload ? JSON.parse(item.payload) : {};
  switch (item.kind) {
    case "login":
      await ensureLoggedIn();
      return;
    case "discover":
      await discoverJobs(payload);
      // After discovering, enqueue apply jobs for matched
      enqueueAppliesForFreshJobs();
      return;
    case "apply":
      await applyToJob({ jobId: payload.jobId });
      return;
    default:
      throw new Error(`unknown queue kind: ${item.kind}`);
  }
}

function enqueueAppliesForFreshJobs() {
  const sqlite = getSqlite();
  // Up to 25 fresh discovered jobs become apply tasks
  const fresh = sqlite.prepare(
    `SELECT id FROM jobs WHERE status='discovered' AND id NOT IN (SELECT job_id FROM applications) ORDER BY id DESC LIMIT 25`
  ).all() as any[];
  const ins = sqlite.prepare(`INSERT INTO queue (kind, payload, next_run_at) VALUES ('apply', ?, ?)`);
  const now = Date.now();
  for (let i = 0; i < fresh.length; i++) {
    // Stagger 30–120s apart
    const delay = (i + 1) * (30_000 + Math.floor(Math.random() * 90_000));
    ins.run(JSON.stringify({ jobId: fresh[i].id }), now + delay);
  }
  if (fresh.length) emit("queue:enqueued_applies", { count: fresh.length });
}

let lastDiscover = 0;
function maybeEnqueueDiscover() {
  const sqlite = getSqlite();
  const filters = sqlite.prepare(`SELECT * FROM search_filters WHERE active = 1 ORDER BY id DESC LIMIT 1`).get() as any;
  if (!filters) return;
  // Discover at most every 30 minutes
  if (Date.now() - lastDiscover < 30 * 60_000) return;
  lastDiscover = Date.now();
  sqlite.prepare(`INSERT INTO queue (kind, payload, next_run_at) VALUES ('discover', ?, unixepoch()*1000)`).run(
    JSON.stringify({
      keywords: JSON.parse(filters.keywords),
      locations: JSON.parse(filters.locations),
      remote: !!filters.remote,
      postedWithinDays: filters.posted_within_days,
      exclusions: JSON.parse(filters.exclusions),
    })
  );
  emit("queue:enqueued_discover", {});
}

export function enqueue(kind: string, payload?: Record<string, unknown>) {
  getSqlite().prepare(`INSERT INTO queue (kind, payload, next_run_at) VALUES (?, ?, unixepoch()*1000)`)
    .run(kind, JSON.stringify(payload ?? {}));
}
