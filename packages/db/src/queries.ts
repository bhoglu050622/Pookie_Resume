import { getDb, getSqlite } from "./client.js";
import { settings, jobs, applications, queue, events, answerCache, answers } from "./schema.js";
import { eq, and, desc, sql, gte, lt } from "drizzle-orm";

const db = () => getDb();

export const Settings = {
  get<T = unknown>(key: string, fallback: T): T {
    const r = db().select().from(settings).where(eq(settings.key, key)).get();
    return r ? (r.value as T) : fallback;
  },
  set(key: string, value: unknown) {
    const stmt = getSqlite().prepare(
      `INSERT INTO settings (key, value, ts) VALUES (?, ?, unixepoch()*1000)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value, ts=excluded.ts`
    );
    stmt.run(key, JSON.stringify(value));
  },
};

export const Events = {
  log(kind: string, payload: Record<string, unknown> = {}, ids: { applicationId?: number; jobId?: number } = {}) {
    db().insert(events).values({ kind, payload, applicationId: ids.applicationId, jobId: ids.jobId }).run();
  },
};

export const Cache = {
  get(hash: string) {
    return db().select().from(answerCache).where(eq(answerCache.questionHash, hash)).get();
  },
  put(hash: string, questionText: string, fieldType: string, answer: string) {
    const stmt = getSqlite().prepare(
      `INSERT INTO answer_cache (question_hash, question_text, field_type, answer, hit_count, last_used_at, ts)
       VALUES (?, ?, ?, ?, 0, unixepoch()*1000, unixepoch()*1000)
       ON CONFLICT(question_hash) DO UPDATE SET answer=excluded.answer, last_used_at=excluded.last_used_at`
    );
    stmt.run(hash, questionText, fieldType, answer);
  },
  hit(hash: string) {
    getSqlite().prepare(
      `UPDATE answer_cache SET hit_count = hit_count + 1, last_used_at = unixepoch()*1000 WHERE question_hash = ?`
    ).run(hash);
  },
};

export function dailyAppCount(now = Date.now()): number {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const r = getSqlite()
    .prepare(`SELECT COUNT(*) AS n FROM applications WHERE submitted_at >= ?`)
    .get(startOfDay.getTime()) as { n: number };
  return r?.n ?? 0;
}

export function todayFunnel(now = Date.now()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const startMs = start.getTime();
  const sqlite = getSqlite();
  const discovered = (sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE ts >= ?`).get(startMs) as any).n;
  const matched = (sqlite.prepare(`SELECT COUNT(*) AS n FROM jobs WHERE ts >= ? AND status IN ('matched','queued','applied')`).get(startMs) as any).n;
  const filled = (sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE ts >= ? AND status NOT IN ('queued','filling')`).get(startMs) as any).n;
  const awaiting = (sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE ts >= ? AND status = 'awaiting_review'`).get(startMs) as any).n;
  const submitted = (sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE submitted_at >= ?`).get(startMs) as any).n;
  const replied = (sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE ts >= ? AND status IN ('replied','interview')`).get(startMs) as any).n;
  return { discovered, matched, filled, awaiting, submitted, replied };
}

export function weeklySparkline() {
  // Returns last 7 days (oldest first) of submitted counts.
  const sqlite = getSqlite();
  const out: Array<{ day: string; count: number }> = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const start = d.getTime();
    const end = start + 24 * 60 * 60 * 1000;
    const n = (sqlite.prepare(`SELECT COUNT(*) AS n FROM applications WHERE submitted_at >= ? AND submitted_at < ?`).get(start, end) as any).n;
    out.push({ day: d.toISOString().slice(0, 10), count: n });
  }
  return out;
}

export function lastApplications(limit = 10) {
  return getSqlite()
    .prepare(
      `SELECT a.*, j.title AS job_title, j.company AS company, j.location AS location
       FROM applications a JOIN jobs j ON j.id = a.job_id
       ORDER BY a.ts DESC LIMIT ?`
    )
    .all(limit);
}

export function awaitingReview() {
  return getSqlite()
    .prepare(
      `SELECT a.*, j.title AS job_title, j.company AS company, j.location AS location, j.url AS job_url
       FROM applications a JOIN jobs j ON j.id = a.job_id
       WHERE a.status = 'awaiting_review' ORDER BY a.ts DESC`
    )
    .all();
}
