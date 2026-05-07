import { sqliteTable, text, integer, real, primaryKey, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

const ts = () => integer("ts", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`);

export const profile = sqliteTable("profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  data: text("data", { mode: "json" }).notNull().$type<Record<string, unknown>>(),
  updatedAt: ts(),
});

export const resumes = sqliteTable("resumes", {
  key: text("key", { enum: ["general", "events", "hr"] }).primaryKey(),
  filePath: text("file_path").notNull(),
  parsedText: text("parsed_text"),
  summary: text("summary"),
  updatedAt: ts(),
});

export const questionBank = sqliteTable("question_bank", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts(),
});

export const searchFilters = sqliteTable("search_filters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  keywords: text("keywords", { mode: "json" }).notNull().$type<string[]>(),
  locations: text("locations", { mode: "json" }).notNull().$type<string[]>(),
  remote: integer("remote", { mode: "boolean" }).notNull().default(false),
  postedWithinDays: integer("posted_within_days").notNull().default(7),
  exclusions: text("exclusions", { mode: "json" }).notNull().$type<string[]>().default([] as any),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: ts(),
});

export const jobs = sqliteTable("jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  linkedinId: text("linkedin_id").notNull().unique(),
  title: text("title").notNull(),
  company: text("company").notNull(),
  location: text("location"),
  jdText: text("jd_text"),
  postedAt: integer("posted_at", { mode: "timestamp_ms" }),
  easyApply: integer("easy_apply", { mode: "boolean" }).notNull().default(true),
  url: text("url").notNull(),
  status: text("status", {
    enum: ["discovered", "matched", "queued", "skipped", "applied", "failed"],
  }).notNull().default("discovered"),
  matchedResume: text("matched_resume", { enum: ["general", "events", "hr"] }),
  matchReason: text("match_reason"),
  discoveredAt: ts(),
}, (t) => ({
  byStatus: index("jobs_status_idx").on(t.status),
}));

export const applications = sqliteTable("applications", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  jobId: integer("job_id").notNull().references(() => jobs.id),
  resumeKey: text("resume_key", { enum: ["general", "events", "hr"] }).notNull(),
  coverLetter: text("cover_letter"),
  status: text("status", {
    enum: [
      "queued",
      "filling",
      "shadow",
      "awaiting_review",
      "submitted",
      "viewed",
      "replied",
      "interview",
      "skipped",
      "failed",
    ],
  }).notNull().default("queued"),
  failureReason: text("failure_reason"),
  screenshotPath: text("screenshot_path"),
  htmlSnapshotPath: text("html_snapshot_path"),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  submittedAt: integer("submitted_at", { mode: "timestamp_ms" }),
  updatedAt: ts(),
}, (t) => ({
  byStatus: index("applications_status_idx").on(t.status),
  byJob: index("applications_job_idx").on(t.jobId),
}));

export const answers = sqliteTable("answers", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").notNull().references(() => applications.id),
  questionText: text("question_text").notNull(),
  questionHash: text("question_hash").notNull(),
  fieldType: text("field_type").notNull(),
  answer: text("answer").notNull(),
  confidence: real("confidence").notNull().default(1),
  source: text("source", { enum: ["cache", "llm", "bank", "manual"] }).notNull(),
  createdAt: ts(),
}, (t) => ({
  byApp: index("answers_app_idx").on(t.applicationId),
  byHash: index("answers_hash_idx").on(t.questionHash),
}));

export const answerCache = sqliteTable("answer_cache", {
  questionHash: text("question_hash").primaryKey(),
  questionText: text("question_text").notNull(),
  fieldType: text("field_type").notNull(),
  answer: text("answer").notNull(),
  hitCount: integer("hit_count").notNull().default(0),
  lastUsedAt: ts(),
  createdAt: ts(),
});

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ts: ts(),
  kind: text("kind").notNull(),
  applicationId: integer("application_id"),
  jobId: integer("job_id"),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
}, (t) => ({
  byKind: index("events_kind_idx").on(t.kind),
  byTs: index("events_ts_idx").on(t.ts),
}));

export const formFailures = sqliteTable("form_failures", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  applicationId: integer("application_id").references(() => applications.id),
  screenshotPath: text("screenshot_path"),
  htmlPath: text("html_path"),
  error: text("error").notNull(),
  createdAt: ts(),
});

export const queue = sqliteTable("queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  kind: text("kind", { enum: ["discover", "apply", "submit_pending", "login"] }).notNull(),
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>(),
  status: text("status", {
    enum: ["pending", "running", "done", "failed", "paused"],
  }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull().default(sql`(unixepoch() * 1000)`),
  lastError: text("last_error"),
  createdAt: ts(),
}, (t) => ({
  byStatus: index("queue_status_idx").on(t.status),
  byNextRun: index("queue_next_run_idx").on(t.nextRunAt),
}));

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }).notNull(),
  updatedAt: ts(),
});

export type Job = typeof jobs.$inferSelect;
export type Application = typeof applications.$inferSelect;
export type Resume = typeof resumes.$inferSelect;
export type QueueItem = typeof queue.$inferSelect;
