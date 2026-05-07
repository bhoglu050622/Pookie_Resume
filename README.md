# Pookie

A gentle, local job-application assistant for LinkedIn Easy Apply.

Pookie reads three tailored resumes, picks the best one per job, fills out multi-page Easy Apply forms with an LLM, and shows you a calm dashboard with a funnel and a daily cap. Runs entirely on your Mac. No credentials leave your machine.

## What's in here

```
apps/web      — Next.js dashboard (http://localhost:3000)
apps/worker   — Node + Playwright background worker (http://localhost:3001)
packages/db   — SQLite schema + helpers (Drizzle)
packages/profile — One-shot PDF → structured JSON via Claude vision
resumes/      — general.pdf, events.pdf, hr.pdf
.pookie/      — Runtime data (Chrome session, sqlite, screenshots) — gitignored
```

## First run

```bash
# 1. Install
pnpm install

# 2. Install Playwright's Chromium runtime hook (we use real Chrome)
#    Real Chrome is required — install if you don't have it: https://www.google.com/chrome/
pnpm --filter @pookie/worker exec playwright install chromium

# 3. Configure your API key
cp .env.example .env
# Edit .env and paste your ANTHROPIC_API_KEY

# 4. Initialize the SQLite database
pnpm db:migrate

# 5. Start both web + worker (separate terminals are fine too)
pnpm dev          # runs web (3000) and worker (3001) in parallel
# OR
pnpm dev:web      # in one terminal
pnpm dev:worker   # in another
```

Open http://localhost:3000 and follow the 4-step wizard.

## How it works

1. **Resumes**: Three PDFs are sent once to Claude vision and saved as structured JSON.
2. **Question bank**: You set defaults (visa, salary, notice period) once. Pookie reuses them for every form.
3. **Connect LinkedIn**: A real Chrome window opens. You sign in. The session lives in `.pookie/session/` so you stay signed in across runs.
4. **Discovery**: Worker searches LinkedIn jobs against your filters every ~30 minutes, deduping by job ID.
5. **Apply**: For each job, Pookie picks the best resume (HR / Events / General), generates a short cover letter, opens Easy Apply, snapshots the form, and answers via Claude Haiku. Cached answers (by question hash) skip the LLM.
6. **Shadow mode** (default): Pookie fills every page but stops at Submit. You review and click Submit yourself in the **Review queue** page. After 3 days OR 30 approvals, you're invited to enable auto-submit.
7. **Auto mode**: Same as above, but Pookie clicks Submit. Hard daily cap of 22.

## Safety

Pookie is built to be visible and stoppable.

- **Headed Chrome** — you can always see what's happening
- **Kill switch** — Settings → Stop pookie now, or `⌘ + Shift + P` from any page
- **Daily cap** — never more than 22 applications per day (configurable)
- **Quiet hours** — never applies between 1–6am IST
- **Audit log** — every submission saves a screenshot + HTML + answers JSON in `.pookie/screenshots/<id>/`
- **Confidence threshold** — any answer below 0.6 confidence on a required field halts the application and routes it to the review queue

## Deployment

**Pookie is a local desktop tool, not a serverless web app.** It needs:
- a real Chrome browser running headed (Playwright launches it)
- a persistent filesystem for the SQLite DB and the LinkedIn session
- a long-running worker process (port 3001) — not a function-per-request

Vercel/Netlify will compile the frontend but the deployed app will be broken because none of the above exist on serverless. Recommended hosts:

- **Marina's Mac** (default — what this is built for). `pnpm dev` on her laptop.
- **VPS (Fly.io / Railway / Hetzner / DigitalOcean)** — deploy as a single Node process. Add `playwright install chromium` in the build step. Cheap, works.
- **Tailscale** — keep it on Marina's Mac, share the URL only with you over a private mesh.
- **Cloudflare Tunnel** — same idea, public URL pointing at her local server.

## LinkedIn ToS

LinkedIn prohibits automated activity. Pookie mitigates ban risk with stealth, human-like cadence, low daily volume, real-Chrome browsing, and a kill switch — but the risk is real. Use it on your primary account at your own discretion.

## Useful commands

```bash
pnpm db:migrate         # initialize / re-apply schema
pnpm parse-resumes      # re-parse the three PDFs (e.g. after editing them)
pnpm dev:worker         # start the worker only
pnpm dev:web            # start the dashboard only
```

The worker exposes:

- `GET  /health`
- `GET  /status`
- `GET  /dashboard`
- `GET  /awaiting`
- `POST /start | /pause | /resume | /login | /discover`
- `POST /applications/:id/submit | /skip`
- `POST /mode  { mode: 'shadow' | 'auto' }`
- `GET  /stream`  (SSE)

## Stack

Next.js 15 · React 19 · Tailwind v4 · Drizzle + better-sqlite3 · Playwright + stealth · Hono · Gemini 2.5 Flash (`@google/genai`) for forms, resume picker, cover letters, and PDF profile extraction (native multimodal — no separate PDF parser needed) · Recharts · Framer Motion.

All model calls use `gemini-2.5-flash`. Thinking is disabled on form Q&A and the resume picker (we want fast, deterministic classification); kept on with a small budget for cover letters where taste matters. Get a free key at https://aistudio.google.com/apikey.

---

Made with care.
