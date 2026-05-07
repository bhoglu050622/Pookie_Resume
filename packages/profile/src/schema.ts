import { z } from "zod";

export const ProfileSchema = z.object({
  full_name: z.string(),
  preferred_name: z.string().optional(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  linkedin_url: z.string().optional(),
  portfolio_url: z.string().optional(),
  summary: z.string().describe("2-3 sentence professional summary"),
  education: z.array(
    z.object({
      degree: z.string(),
      school: z.string(),
      location: z.string().optional(),
      start_year: z.string().optional(),
      end_year: z.string().optional(),
      details: z.string().optional(),
    })
  ),
  work_history: z.array(
    z.object({
      title: z.string(),
      company: z.string(),
      location: z.string().optional(),
      start: z.string(),
      end: z.string(),
      bullets: z.array(z.string()),
    })
  ),
  skills: z.array(z.string()),
  languages: z.array(z.string()).default([]),
  certifications: z.array(z.string()).default([]),
  awards: z.array(z.string()).default([]),
  // Defaults useful for application forms.
  defaults: z.object({
    work_authorization: z.string().describe("e.g. 'Indian citizen, no sponsorship needed for India roles'"),
    notice_period: z.string(),
    salary_expectation: z.string(),
    willing_to_relocate: z.boolean().default(true),
    open_to_remote: z.boolean().default(true),
    open_to_hybrid: z.boolean().default(true),
    open_to_onsite: z.boolean().default(true),
    years_of_experience: z.number(),
  }),
});

export type Profile = z.infer<typeof ProfileSchema>;

export const ResumeKey = z.enum(["general", "events", "hr"]);
export type ResumeKey = z.infer<typeof ResumeKey>;

export const ResumeMetaSchema = z.object({
  key: ResumeKey,
  summary: z.string().describe("1 sentence describing what this resume version emphasizes"),
  best_for: z.array(z.string()).describe("Job title patterns this resume targets, e.g. ['HR coordinator','people partner']"),
  parsed_text: z.string(),
});
export type ResumeMeta = z.infer<typeof ResumeMetaSchema>;
