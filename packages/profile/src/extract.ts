/**
 * One-shot script: read the 3 PDFs in resumes/, send to Gemini 2.5 Flash with
 * inline PDF data (native multimodal), extract structured profile JSON.
 * Persists to DB + .pookie/profile.json.
 *
 * Run: pnpm parse-resumes
 */
import { config as loadDotenv } from "dotenv";
import { GoogleGenAI } from "@google/genai";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ProfileSchema, ResumeMetaSchema, type Profile, type ResumeMeta } from "./schema.js";
import { getDb, getSqlite, schema } from "@pookie/db";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
loadDotenv({ path: path.resolve(__dirname, "../../../.env") });

const ROOT = path.resolve(__dirname, "../../..");
const RESUMES_DIR = path.join(ROOT, "resumes");
const OUT_DIR = path.join(ROOT, ".pookie");

const KEYS = ["general", "events", "hr"] as const;
type Key = (typeof KEYS)[number];

const apiKey = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey ?? "" });

function pdfToB64(p: string): string {
  return readFileSync(p).toString("base64");
}

const ExtractSchema = z.object({
  profile: ProfileSchema,
  resume_meta: ResumeMetaSchema.omit({ parsed_text: true }),
});

async function withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const status = e?.status ?? e?.response?.status;
      const retriable = status === 429 || status === 503 || status === 500;
      if (!retriable || i === attempts - 1) throw e;
      const wait = 1500 * Math.pow(2, i) + Math.floor(Math.random() * 800);
      console.log(`  ↻ retry ${i + 1}/${attempts - 1} in ${wait}ms (${status})`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

// Gemini responseSchema (subset of OpenAPI 3.0). Drives strict JSON shape.
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    profile: {
      type: "object",
      properties: {
        full_name: { type: "string" },
        preferred_name: { type: "string" },
        email: { type: "string" },
        phone: { type: "string" },
        location: { type: "string" },
        linkedin_url: { type: "string" },
        portfolio_url: { type: "string" },
        summary: { type: "string" },
        education: {
          type: "array",
          items: {
            type: "object",
            properties: {
              degree: { type: "string" },
              school: { type: "string" },
              location: { type: "string" },
              start_year: { type: "string" },
              end_year: { type: "string" },
              details: { type: "string" },
            },
            required: ["degree", "school"],
          },
        },
        work_history: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              company: { type: "string" },
              location: { type: "string" },
              start: { type: "string" },
              end: { type: "string" },
              bullets: { type: "array", items: { type: "string" } },
            },
            required: ["title", "company", "start", "end", "bullets"],
          },
        },
        skills: { type: "array", items: { type: "string" } },
        languages: { type: "array", items: { type: "string" } },
        certifications: { type: "array", items: { type: "string" } },
        awards: { type: "array", items: { type: "string" } },
        defaults: {
          type: "object",
          properties: {
            work_authorization: { type: "string" },
            notice_period: { type: "string" },
            salary_expectation: { type: "string" },
            willing_to_relocate: { type: "boolean" },
            open_to_remote: { type: "boolean" },
            open_to_hybrid: { type: "boolean" },
            open_to_onsite: { type: "boolean" },
            years_of_experience: { type: "number" },
          },
          required: [
            "work_authorization", "notice_period", "salary_expectation",
            "willing_to_relocate", "open_to_remote", "open_to_hybrid", "open_to_onsite",
            "years_of_experience",
          ],
        },
      },
      required: [
        "full_name", "email", "phone", "location", "summary",
        "education", "work_history", "skills", "defaults",
      ],
    },
    resume_meta: {
      type: "object",
      properties: {
        key: { type: "string", enum: ["general", "events", "hr"] },
        summary: { type: "string" },
        best_for: { type: "array", items: { type: "string" } },
      },
      required: ["key", "summary", "best_for"],
    },
    parsed_text: { type: "string" },
  },
  required: ["profile", "resume_meta", "parsed_text"],
};

async function extractOne(key: Key): Promise<{ profile: Profile; meta: ResumeMeta }> {
  const file = path.join(RESUMES_DIR, `${key}.pdf`);
  if (!existsSync(file)) throw new Error(`Missing resume PDF: ${file}`);
  const b64 = pdfToB64(file);

  const sys = `You extract structured data from resumes for a job-application automation tool. If a field is unknown, use a sensible default (empty string, [] for arrays). Default booleans to true unless the resume contradicts.

Inferences for the "defaults" object:
- years_of_experience: integer based on total work history span (months / 12, rounded)
- work_authorization: based on listed location and citizenship signals (e.g. "Indian citizen, no sponsorship needed for India roles")
- salary_expectation: "Open to discussion based on role and market" if unclear
- notice_period: "30 days" if unclear
- willing_to_relocate, open_to_remote, open_to_hybrid, open_to_onsite: true unless resume contradicts`;

  const userPrompt = `This is the "${key}" variant of a candidate's resume.

Extract a complete structured profile, resume metadata, and the plain text content of the resume.

For resume_meta:
- key: "${key}"
- summary: 1 sentence describing what this resume version emphasizes (vs a generic version)
- best_for: 3–8 job-title patterns this resume targets (e.g. ["HR coordinator", "people partner"])`;

  const resp = await withRetry(() =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        { inlineData: { mimeType: "application/pdf", data: b64 } },
        { text: userPrompt },
      ],
      config: {
        systemInstruction: sys,
        temperature: 0,
        maxOutputTokens: 8000,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA as any,
        thinkingConfig: { thinkingBudget: 0 },
      },
    })
  );

  const text = resp.text ?? "";
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error(`Could not parse JSON from model output:\n${text.slice(0, 500)}`);
    parsed = JSON.parse(m[0]);
  }

  const parsedText: string = typeof parsed?.parsed_text === "string" ? parsed.parsed_text : "";
  const ok = ExtractSchema.safeParse(parsed);
  if (!ok.success) {
    console.error("Schema validation failed:", JSON.stringify(ok.error.format(), null, 2));
    throw new Error("Profile JSON did not match schema.");
  }

  return {
    profile: ok.data.profile,
    meta: { ...ok.data.resume_meta, parsed_text: parsedText },
  };
}

async function main() {
  if (!apiKey) {
    console.error("ERROR: GEMINI_API_KEY not set. Copy .env.example → .env and fill it in.");
    process.exit(1);
  }
  console.log("Extracting structured profile from 3 resumes via Gemini 2.5 Flash…");

  // Serialize: free tier can return 503 under load, so we don't fan out.
  const g = await extractOne("general");
  const e = await extractOne("events");
  const h = await extractOne("hr");

  // Use the GENERAL resume's profile as the master.
  const master: Profile = g.profile;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(path.join(OUT_DIR, "profile.json"), JSON.stringify(master, null, 2));
  console.log("✓ Wrote .pookie/profile.json");

  // Persist to DB
  getDb();
  const sqlite = getSqlite();
  if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='profile'").get()) {
    console.error("DB not migrated yet. Run: pnpm db:migrate");
    process.exit(1);
  }
  sqlite.prepare(`INSERT INTO profile (data) VALUES (?)`).run(JSON.stringify(master));

  const upsertResume = sqlite.prepare(
    `INSERT INTO resumes (key, file_path, parsed_text, summary, ts) VALUES (?, ?, ?, ?, unixepoch()*1000)
     ON CONFLICT(key) DO UPDATE SET file_path=excluded.file_path, parsed_text=excluded.parsed_text, summary=excluded.summary, ts=excluded.ts`
  );
  for (const { meta } of [g, e, h]) {
    const filePath = path.join(RESUMES_DIR, `${meta.key}.pdf`);
    const summary = `${meta.summary} Best for: ${meta.best_for.join(", ")}.`;
    upsertResume.run(meta.key, filePath, meta.parsed_text, summary);
  }

  console.log("✓ Persisted profile + 3 resume rows to DB.");
  console.log("Done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
