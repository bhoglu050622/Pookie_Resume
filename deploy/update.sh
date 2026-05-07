#!/usr/bin/env bash
# Pull latest code, reinstall, rebuild, restart. Run as root or via sudo.
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/pookie}"
APP_USER="${APP_USER:-pookie}"

cd "$APP_DIR"
echo "==> git pull"
sudo -u "$APP_USER" git fetch origin
sudo -u "$APP_USER" git reset --hard origin/main

echo "==> pnpm install"
sudo -u "$APP_USER" pnpm install --frozen-lockfile

echo "==> migrate db (idempotent)"
sudo -u "$APP_USER" pnpm --filter @pookie/db migrate || true

echo "==> rebuild web"
sudo -u "$APP_USER" pnpm --filter @pookie/web build

echo "==> restart services"
systemctl restart pookie-worker pookie-web

systemctl status --no-pager pookie-worker pookie-web | head -30
echo
echo "✓ updated"
