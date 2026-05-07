#!/usr/bin/env bash
# Build the Next.js standalone bundle locally and rsync it to Hostinger
# Business shared hosting (Phusion Passenger via .htaccess).
#
# Required env (export or pass inline):
#   HOSTINGER_USER     — SSH user (e.g. u228387150)
#   HOSTINGER_HOST     — server IP
#   HOSTINGER_PORT     — SSH port (e.g. 65002)
#   HOSTINGER_DOMAIN   — domain folder under ~/domains/ (e.g. replymommy.com)
#   HOSTINGER_PASS     — SSH password (used via sshpass; or set up key auth)
#   WORKER_URL         — Railway/etc. worker URL the web app talks to
#   WORKER_TOKEN       — bearer token for the worker
#
# The script uses rsync with --exclude so that runtime files on the server
# (the dotenv wrapper, .env, tmp/restart.txt) survive redeploys.

set -euo pipefail

: "${HOSTINGER_USER:?set HOSTINGER_USER}"
: "${HOSTINGER_HOST:?set HOSTINGER_HOST}"
: "${HOSTINGER_PORT:?set HOSTINGER_PORT}"
: "${HOSTINGER_DOMAIN:?set HOSTINGER_DOMAIN}"
: "${WORKER_URL:?set WORKER_URL}"
: "${WORKER_TOKEN:?set WORKER_TOKEN}"

APP_DIR="domains/${HOSTINGER_DOMAIN}/nodejs"
SSH_OPTS="-p ${HOSTINGER_PORT} -o StrictHostKeyChecking=accept-new"

if [ -n "${HOSTINGER_PASS:-}" ]; then
  SSH="sshpass -p ${HOSTINGER_PASS} ssh ${SSH_OPTS}"
  RSYNC_E="sshpass -p ${HOSTINGER_PASS} ssh ${SSH_OPTS}"
else
  SSH="ssh ${SSH_OPTS}"
  RSYNC_E="ssh ${SSH_OPTS}"
fi

echo "==> building web (Next standalone)"
pnpm --filter @pookie/web build

cd apps/web
mkdir -p .next/standalone/apps/web/.next
cp -R .next/static .next/standalone/apps/web/.next/static
[ -d public ] && cp -R public .next/standalone/apps/web/public

echo "==> rsync to ${HOSTINGER_USER}@${HOSTINGER_HOST}:${APP_DIR}/"
$RSYNC_E ${HOSTINGER_USER}@${HOSTINGER_HOST}:dummy 2>/dev/null || true  # warm host key
rsync -az --delete \
  --exclude '/index.mjs' \
  --exclude '/.env' \
  --exclude '/tmp' \
  -e "${RSYNC_E}" \
  .next/standalone/ "${HOSTINGER_USER}@${HOSTINGER_HOST}:${APP_DIR}/"

cd - >/dev/null

echo "==> writing .env + ensuring wrapper/tmp + restarting"
$SSH "${HOSTINGER_USER}@${HOSTINGER_HOST}" "
set -e
mkdir -p ${APP_DIR}/tmp
# Always (re)write .env with the latest values
cat > ${APP_DIR}/.env <<EOF
NODE_ENV=production
HOSTNAME=0.0.0.0
WORKER_URL=${WORKER_URL}
WORKER_TOKEN=${WORKER_TOKEN}
WORKER_TIMEOUT_MS=120000
EOF
chmod 600 ${APP_DIR}/.env

# Ensure the dotenv wrapper exists (idempotent)
cat > ${APP_DIR}/index.mjs <<'WRAP'
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
try {
  const raw = readFileSync(resolve(here, '.env'), 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*\$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^[\"']|[\"']\$/g, '');
  }
} catch (e) { console.error('dotenv load skipped:', e?.message); }
await import('./apps/web/server.js');
WRAP

# Trigger Passenger restart
touch ${APP_DIR}/tmp/restart.txt
echo done
"

echo "✓ deployed to https://${HOSTINGER_DOMAIN}/"
