// Demo data shown when the worker is unreachable (e.g. cloud preview on Vercel).
// The worker is a local Playwright process that talks to LinkedIn — it cannot run
// on Vercel's serverless platform, so we ship a populated snapshot instead of an
// "offline" error. To run with real data, start the worker locally:
//   pnpm dev:worker

// Demo when explicitly requested, OR on Vercel without a worker configured.
// Setting WORKER_URL on Vercel turns demo OFF and uses the real worker.
export const IS_DEMO =
  process.env.POOKIE_DEMO === "1" ||
  (process.env.VERCEL === "1" && !process.env.WORKER_URL);

const day = (offset: number) =>
  new Date(Date.now() - offset * 86400000).toISOString().slice(0, 10);

export const demoStatus = {
  mode: "shadow" as const,
  paused: false,
  daily_cap: 22,
  daily_count: 7,
  onboarded: true,
  session_logged_in: true,
  shadow_started_at: Date.now() - 2 * 86400000,
  shadow_approvals: 14,
};

export const demoDashboard = {
  funnel: {
    discovered: 142,
    matched: 58,
    filled: 19,
    awaiting: 3,
    submitted: 7,
    replied: 2,
  },
  sparkline: [
    { day: day(6), count: 3 },
    { day: day(5), count: 5 },
    { day: day(4), count: 4 },
    { day: day(3), count: 8 },
    { day: day(2), count: 6 },
    { day: day(1), count: 7 },
    { day: day(0), count: 7 },
  ],
  last: [
    { id: 1, company: "Stripe", job_title: "Events Coordinator", location: "Remote", status: "submitted", resume_key: "events", submitted_at: Date.now() - 3_600_000 },
    { id: 2, company: "Notion", job_title: "People Operations Associate", location: "New York, NY", status: "submitted", resume_key: "hr", submitted_at: Date.now() - 7_200_000 },
    { id: 3, company: "Linear", job_title: "Talent Coordinator", location: "Remote", status: "replied", resume_key: "hr", submitted_at: Date.now() - 86_400_000 },
    { id: 4, company: "Vercel", job_title: "Recruiting Coordinator", location: "San Francisco, CA", status: "interview", resume_key: "hr", submitted_at: Date.now() - 172_800_000 },
    { id: 5, company: "Figma", job_title: "Event Marketing Specialist", location: "Remote", status: "submitted", resume_key: "events", submitted_at: Date.now() - 90_000_000 },
    { id: 6, company: "Ramp", job_title: "HR Generalist", location: "New York, NY", status: "skipped", resume_key: "hr", submitted_at: Date.now() - 100_000_000 },
  ],
  awaiting: 3,
};

export const demoAwaiting = [
  { id: 7, company: "Anthropic", job_title: "Recruiting Coordinator", location: "Remote", resume_key: "hr", reason: "Open-ended question needs your voice" },
  { id: 8, company: "Perplexity", job_title: "Events Manager", location: "San Francisco, CA", resume_key: "events", reason: "Salary expectation outside default range" },
  { id: 9, company: "Cursor", job_title: "Talent Operations", location: "Remote", resume_key: "hr", reason: "Custom cover letter requested" },
];

export const demoAnalytics = {
  byResume: [
    { resume_key: "hr", total: 38, submitted: 22, replied: 5, interview: 2 },
    { resume_key: "events", total: 24, submitted: 14, replied: 3, interview: 1 },
    { resume_key: "default", total: 11, submitted: 6, replied: 1, interview: 0 },
  ],
  tod: Array.from({ length: 24 }, (_, h) => ({
    hour: String(h).padStart(2, "0"),
    sent: [0, 0, 0, 0, 0, 0, 0, 1, 3, 6, 8, 9, 7, 6, 8, 7, 5, 3, 2, 1, 0, 0, 0, 0][h],
    replied: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 2, 2, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0][h],
  })),
  days: Array.from({ length: 14 }, (_, i) => ({
    day: day(13 - i),
    n: [2, 3, 4, 6, 5, 7, 4, 8, 6, 9, 7, 8, 6, 7][i],
  })),
};
