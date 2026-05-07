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

The app is split into two halves so the frontend can live on Vercel:

```
[Vercel: Next.js web]  ──HTTPS──►  [Railway: worker (Playwright + SQLite)]
```

The web app is a thin HTTP client — all data and actions go through the worker.
The worker holds the browser, the LinkedIn session, the SQLite DB, and the
applications loop. It cannot run on Vercel (serverless ≠ daemon, no persistent
disk, function size limits).

### 1. Deploy the worker to Railway

1. Create a new Railway project pointed at this repo.
2. Set the service's **root directory** to `apps/worker` (Railway auto-picks
   `apps/worker/Dockerfile` and `apps/worker/railway.toml`).
3. Add a **volume** mounted at `/data` (Settings → Volumes). This holds the
   SQLite DB, LinkedIn cookies, and screenshot audit trail across redeploys.
4. Set env vars:
   - `GOOGLE_GENAI_API_KEY` — your Gemini key (or `ANTHROPIC_API_KEY` if you swap providers)
   - `WORKER_TOKEN` — a long random string; the web app will send this as `Authorization: Bearer ...`
   - `WEB_ORIGIN` — your Vercel URL (e.g. `https://pookie-resume.vercel.app`) — optional, hardens CORS
5. Deploy. Note the public URL Railway assigns (e.g. `https://pookie-worker-production.up.railway.app`).

### 2. Configure Vercel

Set these env vars on the Vercel project (Settings → Environment Variables):

- `WORKER_URL` — the Railway URL from step 1.5
- `WORKER_TOKEN` — the **same** token you set on Railway
- `WORKER_TIMEOUT_MS` — optional, defaults to `8000`

Redeploy. With `WORKER_URL` set, the dashboard talks to Railway and the
"Preview mode" banner disappears. Without it, Vercel falls back to demo data
so the URL is never broken.

### 3. First-time login

After deploy you still need to log into LinkedIn **once**. Two options:

- **Run the worker locally first** (`pnpm dev:worker` → click "Connect
  LinkedIn"), then copy `.pookie/session/` to Railway's volume via
  `railway run` shell and an `scp`-equivalent. The session is just cookies
  + storage — Marina stays logged in across redeploys.
- **Or** ssh into the Railway container, run `playwright codegen
  https://www.linkedin.com/login`, sign in, and the persistent profile at
  `/data/session/` captures cookies.

LinkedIn requires a headed browser for the initial login (2FA / device
verification). Once cookies are in `/data/session/`, the worker reuses them
headless or headed depending on your config.

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
- `GET  /analytics`
- `GET  /settings`
- `GET  /screenshot/:id`
- `POST /settings`
- `POST /onboarding/complete`
- `POST /parse-resumes`
- `POST /start | /pause | /resume | /login | /discover`
- `POST /applications/:id/submit | /skip`
- `POST /mode  { mode: 'shadow' | 'auto' }`
- `GET  /stream`  (SSE)

All endpoints (except `/health`) require `Authorization: Bearer $WORKER_TOKEN`
when `WORKER_TOKEN` is set on the worker.

## Stack

Next.js 15 · React 19 · Tailwind v4 · Drizzle + better-sqlite3 · Playwright + stealth · Hono · Gemini 2.5 Flash (`@google/genai`) for forms, resume picker, cover letters, and PDF profile extraction (native multimodal — no separate PDF parser needed) · Recharts · Framer Motion.

All model calls use `gemini-2.5-flash`. Thinking is disabled on form Q&A and the resume picker (we want fast, deterministic classification); kept on with a small budget for cover letters where taste matters. Get a free key at https://aistudio.google.com/apikey.

---

Made with care.
