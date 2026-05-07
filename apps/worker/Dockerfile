# Worker container — Hono HTTP API + Playwright Chromium for LinkedIn automation.
# Designed for Railway / Fly / Render. Mount a persistent volume at /data
# so the SQLite DB, screenshots, and LinkedIn session survive restarts.

FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

RUN npm install -g pnpm@10.14.0

# Workspace metadata first (better cache)
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/db/package.json packages/db/
COPY packages/profile/package.json packages/profile/
COPY apps/worker/package.json apps/worker/

RUN pnpm install --frozen-lockfile --filter @pookie/worker... --filter @pookie/db... --filter @pookie/profile...

# Source
COPY packages/db packages/db
COPY packages/profile packages/profile
COPY apps/worker apps/worker

# Persistent state lives on the mounted volume.
# `.pookie/` is the convention the codebase uses for DB + session + screenshots,
# so we symlink it to /data at boot. /data must be a Railway volume — without it,
# uploaded resumes / DB / Chrome cookies vanish on every redeploy.
ENV DB_PATH=/data/pookie.db
ENV PERSISTENT_PROFILE_DIR=/data/session
ENV WORKER_PORT=3001
EXPOSE 3001

WORKDIR /app/apps/worker
CMD ["sh", "-c", "mkdir -p /data/screenshots /data/session /data/resumes && ln -sfn /data /app/.pookie && rm -rf /app/resumes && ln -sfn /data/resumes /app/resumes && cd /app && pnpm --filter @pookie/db migrate && cd /app/apps/worker && pnpm start"]
