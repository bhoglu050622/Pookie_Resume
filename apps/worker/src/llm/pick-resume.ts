import { z } from "zod";
import { gemini, MODELS } from "./client.js";
import { getDb, schema } from "@pookie/db";
import { log } from "../log.js";

const Out = z.object({
  resume: z.enum(["general", "events", "hr"]),
  reason: z.string(),
});
export type ResumePick = z.infer<typeof Out>;

export async function pickResume(opts: {
  jobTitle: string;
  jobCompany: string;
  jobDescription: string;
}): Promise<ResumePick> {
  const db = getDb();
  const rs = await db.select().from(schema.resumes);
  const summaries = rs.map((r) => `${r.key}: ${r.summary ?? ""}`).join("\n");

  const sys = `You pick the best resume variant for a given job. Three variants: general (corporate communications, content), events (event coordination, hospitality), hr (people ops, HR coordination, employee experience). Output STRICT JSON: {"resume":"general|events|hr","reason":"..."}.`;

  const prompt = `Resume summaries:
${summaries}

Job:
- Title: ${opts.jobTitle}
- Company: ${opts.jobCompany}
- Description: ${opts.jobDescription.slice(0, 2500)}

Pick one resume key and explain in <=20 words.`;

  const resp = await gemini().models.generateContent({
    model: MODELS.picker,
    contents: prompt,
    config: {
      systemInstruction: sys,
      temperature: 0,
      maxOutputTokens: 200,
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
    parsed = m ? JSON.parse(m[0]) : { resume: "general", reason: "fallback" };
  }
  const ok = Out.safeParse(parsed);
  if (!ok.success) {
    log.warn({ text }, "pickResume schema failed; falling back to general");
    return { resume: "general", reason: "fallback" };
  }
  return ok.data;
}
