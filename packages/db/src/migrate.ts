// Lightweight push: build the SQL once from the schema and run it.
// We avoid a separate migration folder for v1 — the schema is small and additive.
import { getSqlite } from "./client.js";

const sql = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS resumes (
  key TEXT PRIMARY KEY,
  file_path TEXT NOT NULL,
  parsed_text TEXT,
  summary TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS question_bank (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS search_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keywords TEXT NOT NULL,
  locations TEXT NOT NULL,
  remote INTEGER NOT NULL DEFAULT 0,
  posted_within_days INTEGER NOT NULL DEFAULT 7,
  exclusions TEXT NOT NULL DEFAULT '[]',
  active INTEGER NOT NULL DEFAULT 1,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  linkedin_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  jd_text TEXT,
  posted_at INTEGER,
  easy_apply INTEGER NOT NULL DEFAULT 1,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'discovered',
  matched_resume TEXT,
  match_reason TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS jobs_status_idx ON jobs(status);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL REFERENCES jobs(id),
  resume_key TEXT NOT NULL,
  cover_letter TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  failure_reason TEXT,
  screenshot_path TEXT,
  html_snapshot_path TEXT,
  started_at INTEGER,
  submitted_at INTEGER,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS applications_status_idx ON applications(status);
CREATE INDEX IF NOT EXISTS applications_job_idx ON applications(job_id);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES applications(id),
  question_text TEXT NOT NULL,
  question_hash TEXT NOT NULL,
  field_type TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1,
  source TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS answers_app_idx ON answers(application_id);
CREATE INDEX IF NOT EXISTS answers_hash_idx ON answers(question_hash);

CREATE TABLE IF NOT EXISTS answer_cache (
  question_hash TEXT PRIMARY KEY,
  question_text TEXT NOT NULL,
  field_type TEXT NOT NULL,
  answer TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  last_used_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  kind TEXT NOT NULL,
  application_id INTEGER,
  job_id INTEGER,
  payload TEXT
);
CREATE INDEX IF NOT EXISTS events_kind_idx ON events(kind);
CREATE INDEX IF NOT EXISTS events_ts_idx ON events(ts);

CREATE TABLE IF NOT EXISTS form_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES applications(id),
  screenshot_path TEXT,
  html_path TEXT,
  error TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  payload TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_run_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_error TEXT,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE INDEX IF NOT EXISTS queue_status_idx ON queue(status);
CREATE INDEX IF NOT EXISTS queue_next_run_idx ON queue(next_run_at);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  ts INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
`;

const db = getSqlite();
db.exec(sql);

// Seed defaults
const seedDefaults: Array<[string, string]> = [
  ["mode", JSON.stringify("shadow")],
  ["daily_cap", JSON.stringify(22)],
  ["shadow_started_at", JSON.stringify(null)],
  ["shadow_approvals", JSON.stringify(0)],
  ["onboarded", JSON.stringify(false)],
  ["session_logged_in", JSON.stringify(false)],
];
const upsert = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
for (const [k, v] of seedDefaults) upsert.run(k, v);

// eslint-disable-next-line no-console
console.log("✓ pookie.db initialized");
