import { z } from "zod";
import { gemini, MODELS } from "./client.js";
import { Cache } from "@pookie/db/queries.js";
import type { FormField } from "../linkedin/form-snapshot.js";
import { log } from "../log.js";

const AnswerOut = z.object({
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])),
  confidence: z.record(z.string(), z.number()).default({}),
  needs_review: z.array(z.string()).default([]),
});
export type AnswerOutT = z.infer<typeof AnswerOut>;

interface AnswerInput {
  fields: FormField[];
  profile: Record<string, unknown>;
  questionBank: Record<string, string>;
  resumeSummary: string;
  jobTitle: string;
  jobCompany: string;
  jobDescription: string;
  resumeKey: "general" | "events" | "hr";
}

const SYSTEM = `You answer LinkedIn Easy Apply form fields on behalf of a candidate.
You will receive (1) the candidate's structured profile, (2) a question bank of pre-set defaults, (3) the chosen resume variant for this job, (4) the job description, and (5) a snapshot of form fields.

For each field, output the best literal answer in the required type:
- text/textarea/typeahead: a string. For typeaheads (location, company), use a canonical name that matches LinkedIn's autocomplete (e.g. "Bengaluru, Karnataka, India").
- select/radio: the EXACT option string from the provided options array (case-sensitive match preferred).
- checkbox: "true" / "false" string.
- file: leave the value as the literal string "RESUME_FILE" (the orchestrator handles upload).

Numeric questions ("Years of experience with X?") — if the profile shows the candidate has any working experience involving X (or related skill), answer with a small honest integer (1–3). Never invent expertise. If unknown, answer "0" but only as last resort, and flag it for review.

Set confidence per field on 0–1 scale. Use < 0.6 ONLY when truly uncertain or when answering would mislead the recruiter (e.g. claiming a credential the candidate lacks). Add such field ids to needs_review.

Return STRICT JSON: { "answers": { "<field_id>": "..." }, "confidence": { "<field_id>": 0.0 }, "needs_review": ["<field_id>"] }
No prose. No markdown.`;

export async function answerFields(input: AnswerInput): Promise<{ output: AnswerOutT; cacheHits: string[] }> {
  // 1) Cache lookup
  const cacheHits: string[] = [];
  const cacheAnswers: Record<string, string> = {};
  const remaining: FormField[] = [];

  for (const f of input.fields) {
    if (f.type === "file") {
      cacheAnswers[f.id] = "RESUME_FILE";
      cacheHits.push(f.id);
      continue;
    }
    const cached = Cache.get(f.hash);
    if (cached && cached.fieldType === f.type) {
      if (f.options && f.options.length > 0 && !f.options.includes(cached.answer)) {
        // Option set drifted — fall through to LLM
      } else {
        cacheAnswers[f.id] = cached.answer;
        cacheHits.push(f.id);
        Cache.hit(f.hash);
        continue;
      }
    }
    remaining.push(f);
  }

  if (remaining.length === 0) {
    return {
      output: { answers: cacheAnswers, confidence: Object.fromEntries(cacheHits.map((id) => [id, 1])), needs_review: [] },
      cacheHits,
    };
  }

  // 2) Single LLM call for remaining fields
  const userMessage = JSON.stringify(
    {
      job: { title: input.jobTitle, company: input.jobCompany, description: input.jobDescription.slice(0, 3000) },
      resume_key: input.resumeKey,
      resume_summary: input.resumeSummary,
      fields: remaining.map((f) => ({
        id: f.id,
        type: f.type,
        label: f.label,
        options: f.options,
        required: f.required,
        currentValue: f.currentValue,
      })),
    },
    null,
    2
  );

  const profileBlock = `<candidate_profile>
${JSON.stringify(input.profile, null, 2)}
</candidate_profile>

<question_bank>
${JSON.stringify(input.questionBank, null, 2)}
</question_bank>`;

  const resp = await gemini().models.generateContent({
    model: MODELS.forms,
    contents: userMessage,
    config: {
      systemInstruction: `${SYSTEM}\n\n${profileBlock}`,
      temperature: 0,
      maxOutputTokens: 2000,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    },
  });

  const text = resp.text ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error("LLM did not return JSON");
    parsed = JSON.parse(m[0]);
  }

  const ok = AnswerOut.safeParse(parsed);
  if (!ok.success) {
    log.error({ err: ok.error.format(), text }, "answer schema failed");
    throw new Error("LLM output failed schema validation");
  }

  // 3) Merge cache hits + LLM answers
  const merged: AnswerOutT = {
    answers: { ...cacheAnswers, ...stringifyAll(ok.data.answers) },
    confidence: { ...Object.fromEntries(cacheHits.map((id) => [id, 1])), ...ok.data.confidence },
    needs_review: ok.data.needs_review,
  };

  // 4) Cache writeback
  for (const f of remaining) {
    const a = merged.answers[f.id];
    const c = merged.confidence[f.id] ?? 0;
    if (a !== undefined && c >= 0.7 && f.type !== "file") {
      Cache.put(f.hash, f.label, f.type, String(a));
    }
  }

  return { output: merged, cacheHits };
}

function stringifyAll(rec: Record<string, string | number | boolean>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec)) out[k] = String(v);
  return out;
}
