// Logic-only resume parser — no LLM. Used as a fallback when Gemini quota
// is exhausted or billing isn't enabled. Extracts PDF text with `unpdf`,
// pulls email/phone/name via regex, and seeds the profile + resume_meta tables
// with sensible defaults so onboarding can complete.
//
// Run: pnpm --filter @pookie/profile parse:logic

import { extractText, getDocumentProxy } from "unpdf";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ProfileSchema, type Profile, type ResumeMeta } from "./schema.js";
import { getDb, getSqlite, schema } from "@pookie/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "../../..");
const RESUMES_DIR = path.join(ROOT, "resumes");
const OUT_DIR = path.join(ROOT, ".pookie");

const KEYS = ["general", "events", "hr"] as const;
type Key = (typeof KEYS)[number];

const RESUME_PROFILES: Record<Key, Pick<ResumeMeta, "summary" | "best_for">> = {
  general: {
    summary: "Catch-all version emphasizing versatility across coordination and operations roles.",
    best_for: ["coordinator", "associate", "operations", "administrative", "executive assistant", "office manager"],
  },
  events: {
    summary: "Events-focused: planning, vendor coordination, on-site execution, and stakeholder communication.",
    best_for: ["events coordinator", "events manager", "event marketing", "experiential marketing", "event producer", "conference coordinator"],
  },
  hr: {
    summary: "People-ops focused: recruiting, candidate experience, talent operations, and HR coordination.",
    best_for: ["recruiting coordinator", "hr coordinator", "people operations", "talent acquisition", "hr generalist", "people partner"],
  },
};

async function pdfText(p: string): Promise<string> {
  const buf = readFileSync(p);
  const doc = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(doc, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

function pickFirst<T>(...vals: (T | null | undefined)[]): T | undefined {
  for (const v of vals) if (v !== null && v !== undefined && v !== ("" as any)) return v as T;
  return undefined;
}

function extractEmail(text: string): string {
  const m = text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
  return m ? m[0] : "";
}

function extractPhone(text: string): string {
  // International or US-style phone numbers; tolerate spaces, parens, dashes.
  const m = text.match(/(\+?\d[\d\s().-]{8,}\d)/);
  return m ? m[1].replace(/\s+/g, " ").trim() : "";
}

function extractLinkedIn(text: string): string | undefined {
  const m = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[\w-]+/i);
  return m ? (m[0].startsWith("http") ? m[0] : `https://${m[0]}`) : undefined;
}

function extractName(text: string): string {
  // First non-empty line that doesn't look like an email/phone/url.
  for (const raw of text.split(/\r?\n/).slice(0, 8)) {
    const line = raw.trim();
    if (!line) continue;
    if (/[@\d]/.test(line)) continue;
    if (line.length > 60) continue;
    if (line.split(/\s+/).length > 6) continue;
    return line;
  }
  return "Marina";
}

function extractLocation(text: string): string {
  // Look for common Indian metro + a few global cities; fall back to "India".
  const cities = [
    "Bengaluru", "Bangalore", "Mumbai", "Delhi", "Gurugram", "Gurgaon", "Noida",
    "Hyderabad", "Pune", "Chennai", "Kolkata", "Goa", "Jaipur",
    "New York", "San Francisco", "London", "Singapore", "Dubai",
  ];
  for (const c of cities) {
    if (new RegExp(`\\b${c}\\b`, "i").test(text)) return c;
  }
  return "India";
}

function extractSkills(text: string): string[] {
  // Crude: look for a "Skills" header and capture the next ~20 comma-separated items.
  const m = text.match(/(?:skills|core\s+competencies|expertise)[:\s\n]*([^]+?)(?:\n[A-Z][a-z]+\s*\n|$)/i);
  if (!m) return [];
  return m[1]
    .split(/[,•\n•|·]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length < 40)
    .slice(0, 20);
}

function buildProfile(text: string): Profile {
  return {
    full_name: extractName(text),
    email: extractEmail(text),
    phone: extractPhone(text),
    location: extractLocation(text),
    linkedin_url: extractLinkedIn(text),
    summary: "Coordinator with experience across people operations, events, and general administrative work.",
    education: [],
    work_history: [],
    skills: extractSkills(text),
    languages: [],
    certifications: [],
    awards: [],
    defaults: {
      work_authorization: "Indian citizen, no sponsorship needed for India roles",
      notice_period: "30 days",
      salary_expectation: "Open to discussion based on role and market",
      willing_to_relocate: true,
      open_to_remote: true,
      open_to_hybrid: true,
      open_to_onsite: true,
      years_of_experience: 2,
    },
  };
}

async function main() {
  console.log("Extracting resumes via logic (no LLM)…");

  const texts: Record<Key, string> = { general: "", events: "", hr: "" };
  for (const key of KEYS) {
    const p = path.join(RESUMES_DIR, `${key}.pdf`);
    texts[key] = await pdfText(p);
    console.log(`  ✓ ${key}.pdf — ${texts[key].length} chars`);
  }

  // Build profile from the GENERAL resume; merge in any fields missing from
  // it but found in the other two (e.g. phone listed only on hr.pdf).
  const profiles: Record<Key, Profile> = {
    general: buildProfile(texts.general),
    events: buildProfile(texts.events),
    hr: buildProfile(texts.hr),
  };
  const master: Profile = {
    ...profiles.general,
    email: pickFirst(profiles.general.email, profiles.events.email, profiles.hr.email) || "",
    phone: pickFirst(profiles.general.phone, profiles.events.phone, profiles.hr.phone) || "",
    linkedin_url: pickFirst(profiles.general.linkedin_url, profiles.events.linkedin_url, profiles.hr.linkedin_url),
    skills: Array.from(new Set([...profiles.general.skills, ...profiles.events.skills, ...profiles.hr.skills])).slice(0, 30),
  };

  const ok = ProfileSchema.safeParse(master);
  if (!ok.success) {
    console.error("Profile validation failed:", JSON.stringify(ok.error.format(), null, 2));
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "profile.json"), JSON.stringify(ok.data, null, 2));
  console.log("✓ Wrote .pookie/profile.json");

  getDb();
  const sqlite = getSqlite();
  sqlite
    .prepare("INSERT INTO profile (data) VALUES (?)")
    .run(JSON.stringify(ok.data));

  const upsertResume = sqlite.prepare(
    `INSERT INTO resumes (key, file_path, parsed_text, summary, ts) VALUES (?, ?, ?, ?, unixepoch()*1000)
     ON CONFLICT(key) DO UPDATE SET file_path=excluded.file_path, parsed_text=excluded.parsed_text, summary=excluded.summary, ts=excluded.ts`
  );
  for (const key of KEYS) {
    const meta = RESUME_PROFILES[key];
    upsertResume.run(
      key,
      path.join(RESUMES_DIR, `${key}.pdf`),
      texts[key],
      JSON.stringify({ summary: meta.summary, best_for: meta.best_for })
    );
  }

  console.log("✓ pookie.db: profile + 3 resume rows persisted");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
