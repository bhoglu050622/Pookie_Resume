import path from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { getContext, humanWait, humanType, sleep, isQuietHourIST } from "../stealth.js";
import { snapshot, type FormField } from "./form-snapshot.js";
import { hydrateJob } from "./discover.js";
import { ensureLoggedIn } from "./login.js";
import { answerFields } from "../llm/answer.js";
import { pickResume } from "../llm/pick-resume.js";
import { generateCoverLetter } from "../llm/cover-letter.js";
import { getSqlite } from "@pookie/db";
import { Settings, Events, dailyAppCount } from "@pookie/db/queries.js";
import { log, emit } from "../log.js";
import { notify } from "../notify.js";

const ROOT = path.resolve(__dirname, "../../../..");
const RESUMES_DIR = path.join(ROOT, "resumes");
const SCREENSHOTS_DIR = path.join(ROOT, ".pookie/screenshots");

const MIN_CONFIDENCE = 0.6;

interface ApplyParams {
  jobId: number;
}

export async function applyToJob({ jobId }: ApplyParams): Promise<void> {
  const cap = Settings.get<number>("daily_cap", 22);
  if (dailyAppCount() >= cap) {
    log.info({ cap }, "daily cap reached");
    emit("apply:capped", { cap });
    return;
  }
  if (isQuietHourIST()) {
    log.info("quiet hour — skipping");
    emit("apply:quiet_hour", {});
    return;
  }

  const sqlite = getSqlite();
  const job = sqlite.prepare("SELECT * FROM jobs WHERE id = ?").get(jobId) as any;
  if (!job) throw new Error(`job ${jobId} not found`);
  if (job.status === "applied") {
    log.info({ jobId }, "already applied");
    return;
  }

  const ok = await ensureLoggedIn();
  if (!ok) {
    emit("apply:not_logged_in", {});
    return;
  }

  // Hydrate JD if needed
  const jd = (await hydrateJob(job.linkedin_id)) || job.jd_text || "";
  sqlite.prepare("UPDATE jobs SET jd_text = COALESCE(jd_text, ?) WHERE id = ?").run(jd, jobId);

  // Pick resume + generate cover letter (parallel)
  const profile = loadProfile();
  const questionBank = loadQuestionBank();
  const candidateName = String((profile as any).full_name || "Candidate");

  const [pick, coverLetter] = await Promise.all([
    pickResume({ jobTitle: job.title, jobCompany: job.company, jobDescription: jd }),
    Settings.get<boolean>("cover_letters_enabled", true)
      ? generateCoverLetter({
          jobTitle: job.title,
          jobCompany: job.company,
          jobDescription: jd,
          resumeText: getResumeText(getResumeKey(job, "general")),
          candidateName,
        }).catch((e) => {
          log.warn({ err: e?.message }, "cover letter failed");
          return "";
        })
      : Promise.resolve(""),
  ]);

  const resumeKey = pick.resume;
  const resumePath = path.join(RESUMES_DIR, `${resumeKey}.pdf`);
  log.info({ jobId, resumeKey, reason: pick.reason }, "apply:starting");
  emit("apply:starting", { jobId, title: job.title, company: job.company, resumeKey });

  // Mark matched
  sqlite.prepare("UPDATE jobs SET status='queued', matched_resume=?, match_reason=? WHERE id=?")
    .run(resumeKey, pick.reason, jobId);

  // Create application row
  const appRes = sqlite.prepare(
    `INSERT INTO applications (job_id, resume_key, cover_letter, status, started_at, ts)
     VALUES (?, ?, ?, 'filling', unixepoch()*1000, unixepoch()*1000)`
  ).run(jobId, resumeKey, coverLetter || null);
  const applicationId = Number(appRes.lastInsertRowid);
  Events.log("apply:start", { resumeKey }, { applicationId, jobId });

  const ctx = await getContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  let exitReason: "submitted" | "shadow" | "awaiting_review" | "failed" = "failed";
  let failureReason: string | null = null;

  try {
    await page.goto(job.url, { waitUntil: "domcontentloaded" });
    await humanWait(1500, 600);

    // Click "Easy Apply"
    const easyApplyBtn = page.locator('button:has-text("Easy Apply"), button.jobs-apply-button:has-text("Apply")').first();
    if (!(await easyApplyBtn.isVisible({ timeout: 5000 }).catch(() => false))) {
      throw new Error("No Easy Apply button (likely external apply or already applied)");
    }
    await easyApplyBtn.scrollIntoViewIfNeeded();
    await humanWait(700, 250);
    await easyApplyBtn.click();
    await humanWait(1200, 400);

    // Iterate pages of the modal
    const profileSummary = (() => {
      const r = sqlite.prepare("SELECT summary FROM resumes WHERE key = ?").get(resumeKey) as any;
      return r?.summary ?? "";
    })();

    let page_num = 0;
    const maxPages = 6;
    while (page_num < maxPages) {
      page_num++;
      // Wait for modal to settle
      const modal = page.locator('[role="dialog"]').first();
      await modal.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
      await humanWait(900, 300);

      const { snapshot: snap, raw } = await snapshot(page);
      log.info({ page_num, fields: snap.fields.length, isFinalPage: snap.isFinalPage }, "form snapshot");
      emit("apply:page", { jobId, page_num, fields: snap.fields.length });

      if (snap.fields.length > 0) {
        const { output } = await answerFields({
          fields: snap.fields,
          profile,
          questionBank,
          resumeSummary: profileSummary,
          jobTitle: job.title,
          jobCompany: job.company,
          jobDescription: jd,
          resumeKey,
        });

        // Persist answers
        const insertA = sqlite.prepare(
          `INSERT INTO answers (application_id, question_text, question_hash, field_type, answer, confidence, source) VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        const lowConfidence: string[] = [];
        for (const f of snap.fields) {
          const a = output.answers[f.id];
          const c = output.confidence[f.id] ?? 1;
          insertA.run(applicationId, f.label, f.hash, f.type, a !== undefined ? String(a) : "", c, "llm");
          if (c < MIN_CONFIDENCE && f.required) lowConfidence.push(f.id);
        }

        // If anything required is low confidence and we're not on cover-letter-only field, halt for review.
        if (lowConfidence.length > 0 || output.needs_review.some((id) => snap.fields.find((f) => f.id === id)?.required)) {
          await saveAudit(page, applicationId, "awaiting_review");
          sqlite.prepare("UPDATE applications SET status='awaiting_review', screenshot_path=?, html_snapshot_path=? WHERE id=?")
            .run(getScreenshotPath(applicationId), getHtmlPath(applicationId), applicationId);
          Events.log("apply:awaiting_review", { lowConfidence, needs_review: output.needs_review }, { applicationId, jobId });
          notify("Needs review", `${job.title} @ ${job.company}`);
          exitReason = "awaiting_review";
          break;
        }

        // Fill fields
        await fillFields(page, raw as any, output.answers, resumePath, coverLetter || "");
      }

      // Advance: click Next/Review/Submit
      const buttons = page.locator('[role="dialog"] button');
      const submitBtn = buttons.filter({ hasText: /^submit application$|^submit$/i }).first();
      const nextBtn = buttons.filter({ hasText: /^(continue|next|review)/i }).first();

      if (await submitBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        const mode = Settings.get<string>("mode", "shadow");
        await saveAudit(page, applicationId, mode === "shadow" ? "shadow" : "pre-submit");
        if (mode === "shadow") {
          // Shadow mode: don't submit, store snapshot, mark awaiting_review (Marina will click Submit from review page).
          sqlite.prepare(
            `UPDATE applications SET status='awaiting_review', screenshot_path=?, html_snapshot_path=? WHERE id=?`
          ).run(getScreenshotPath(applicationId), getHtmlPath(applicationId), applicationId);
          Events.log("apply:shadow", {}, { applicationId, jobId });
          notify("Ready for review", `${job.title} @ ${job.company}`);
          exitReason = "shadow";
        } else {
          await humanWait(1100, 400);
          await submitBtn.click();
          await humanWait(1800, 600);
          // The dialog may show a confirmation
          sqlite.prepare(
            `UPDATE applications SET status='submitted', submitted_at=unixepoch()*1000, screenshot_path=?, html_snapshot_path=? WHERE id=?`
          ).run(getScreenshotPath(applicationId), getHtmlPath(applicationId), applicationId);
          sqlite.prepare("UPDATE jobs SET status='applied' WHERE id=?").run(jobId);
          Events.log("apply:submitted", {}, { applicationId, jobId });
          // Track shadow-approval count even in auto mode (just for completeness)
          exitReason = "submitted";
        }
        break;
      }

      if (await nextBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
        await humanWait(800, 300);
        await nextBtn.click();
        continue;
      }

      // No advance button — likely a question we couldn't fill (e.g., empty page). Bail.
      throw new Error("No advance button found on form page");
    }
  } catch (err: any) {
    failureReason = err?.message ?? String(err);
    log.error({ err: failureReason, jobId }, "apply failed");
    Events.log("apply:failed", { reason: failureReason }, { applicationId, jobId });
    try { await saveAudit(page, applicationId, "failed"); } catch { /* ignore */ }
    sqlite.prepare(
      `UPDATE applications SET status='failed', failure_reason=?, screenshot_path=?, html_snapshot_path=? WHERE id=?`
    ).run(failureReason, getScreenshotPath(applicationId), getHtmlPath(applicationId), applicationId);
    sqlite.prepare(
      `INSERT INTO form_failures (application_id, screenshot_path, html_path, error) VALUES (?, ?, ?, ?)`
    ).run(applicationId, getScreenshotPath(applicationId), getHtmlPath(applicationId), failureReason);
    exitReason = "failed";
  }

  emit("apply:done", { jobId, applicationId, exitReason });

  // Try to close the modal cleanly
  try {
    const dismiss = page.locator('[role="dialog"] button[aria-label="Dismiss"]').first();
    if (await dismiss.isVisible({ timeout: 1500 }).catch(() => false)) {
      await dismiss.click();
      await humanWait(500, 200);
      // Discard if a confirmation appears
      const discard = page.locator('button:has-text("Discard")').first();
      if (await discard.isVisible({ timeout: 1500 }).catch(() => false)) await discard.click();
    }
  } catch { /* ignore */ }
}

// ---------- helpers ----------

function getScreenshotPath(applicationId: number) {
  const dir = path.join(SCREENSHOTS_DIR, String(applicationId));
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "screenshot.png");
}
function getHtmlPath(applicationId: number) {
  const dir = path.join(SCREENSHOTS_DIR, String(applicationId));
  mkdirSync(dir, { recursive: true });
  return path.join(dir, "snapshot.html");
}

async function saveAudit(page: Page, applicationId: number, _phase: string) {
  const dir = path.join(SCREENSHOTS_DIR, String(applicationId));
  mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, "screenshot.png"), fullPage: false });
  const html = await page.content();
  writeFileSync(path.join(dir, "snapshot.html"), html);
}

function loadProfile(): Record<string, unknown> {
  const sqlite = getSqlite();
  const r = sqlite.prepare("SELECT data FROM profile ORDER BY id DESC LIMIT 1").get() as any;
  if (!r) return {};
  try { return JSON.parse(r.data); } catch { return {}; }
}

function loadQuestionBank(): Record<string, string> {
  const sqlite = getSqlite();
  const rows = sqlite.prepare("SELECT key, value FROM question_bank").all() as any[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

function getResumeText(key: string): string {
  const r = getSqlite().prepare("SELECT parsed_text FROM resumes WHERE key = ?").get(key) as any;
  return r?.parsed_text ?? "";
}

function getResumeKey(job: any, fallback: string): string {
  return job.matched_resume || fallback;
}

async function fillFields(
  page: Page,
  fields: Array<FormField & { _selector?: string }>,
  answers: Record<string, string>,
  resumePath: string,
  coverLetter: string
) {
  for (const f of fields) {
    const val = answers[f.id];
    if (val === undefined || val === null) continue;

    try {
      await humanWait(700, 300);

      if (f.type === "file") {
        // File inputs may require name resolution by selector; otherwise find within the modal.
        const input = f._selector ? page.locator(f._selector).first() : page.locator('[role="dialog"] input[type="file"]').first();
        await input.setInputFiles(resumePath);
        continue;
      }

      if (f.type === "textarea" && /cover|why|interested|note/i.test(f.label) && coverLetter) {
        const ta = await locate(page, f);
        if (ta) await humanType(page, ta, coverLetter);
        continue;
      }

      if (f.type === "text" || f.type === "textarea") {
        const el = await locate(page, f);
        if (el) await humanType(page, el, String(val));
        continue;
      }

      if (f.type === "typeahead") {
        const el = await locate(page, f);
        if (!el) continue;
        await humanType(page, el, String(val));
        await humanWait(800, 300);
        // Pick first listbox option
        const opt = page.locator('[role="listbox"] [role="option"]').first();
        if (await opt.isVisible({ timeout: 3000 }).catch(() => false)) {
          await opt.click();
        } else {
          await page.keyboard.press("Enter");
        }
        continue;
      }

      if (f.type === "select") {
        const el = await locate(page, f);
        if (!el) continue;
        // Native <select>
        await el.selectOption({ label: String(val) }).catch(async () => {
          // If it's a custom listbox, click and pick option by text.
          await el.click();
          await humanWait(400, 150);
          const opt = page.locator(`[role="option"]:has-text(${JSON.stringify(String(val))})`).first();
          if (await opt.isVisible({ timeout: 2000 }).catch(() => false)) await opt.click();
        });
        continue;
      }

      if (f.type === "radio") {
        const want = String(val).toLowerCase().trim();
        const labels = page.locator('[role="dialog"] label');
        const n = await labels.count();
        for (let i = 0; i < n; i++) {
          const txt = (await labels.nth(i).innerText().catch(() => "")).toLowerCase().trim();
          if (txt && txt === want) {
            await labels.nth(i).scrollIntoViewIfNeeded();
            await humanWait(300, 150);
            await labels.nth(i).click();
            break;
          }
        }
        continue;
      }

      if (f.type === "checkbox") {
        const el = await locate(page, f);
        if (!el) continue;
        const isOn = String(val).toLowerCase() === "true";
        const checked = await el.isChecked().catch(() => false);
        if (isOn !== checked) await el.click();
        continue;
      }
    } catch (e: any) {
      log.warn({ err: e?.message, field: f.label }, "fill failed");
    }
  }
}

async function locate(page: Page, f: FormField & { _selector?: string }) {
  if (f._selector) {
    const el = page.locator(f._selector).first();
    if (await el.count()) return el;
  }
  // Fallback by label text
  const lab = page.locator(`[role="dialog"] label:has-text(${JSON.stringify(f.label)})`).first();
  if (await lab.count()) {
    const forAttr = await lab.getAttribute("for");
    if (forAttr) return page.locator(`#${cssEscape(forAttr)}`).first();
  }
  return null;
}

function cssEscape(s: string) {
  return s.replace(/[^a-zA-Z0-9_-]/g, (m) => `\\${m}`);
}
