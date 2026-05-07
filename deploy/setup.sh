#!/usr/bin/env bash
# Pookie one-shot bootstrap for a fresh Hostinger KVM VPS (Ubuntu 22.04 / 24.04).
# Run as root: bash deploy/setup.sh
# Idempotent — safe to re-run.

set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/bhoglu050622/Pookie_Resume.git}"
APP_DIR="${APP_DIR:-/opt/pookie}"
APP_USER="${APP_USER:-pookie}"
NODE_VERSION="${NODE_VERSION:-20}"
PNPM_VERSION="${PNPM_VERSION:-10.14.0}"

echo "==> updating apt + base packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates git build-essential ufw nginx

echo "==> installing Node.js $NODE_VERSION via NodeSource"
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "v$NODE_VERSION"; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> installing pnpm $PNPM_VERSION"
npm install -g pnpm@"$PNPM_VERSION"

echo "==> creating service user $APP_USER"
if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --create-home --home-dir "/home/$APP_USER" --shell /bin/bash "$APP_USER"
fi

echo "==> cloning / updating repo at $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR"
  chown "$APP_USER:$APP_USER" "$APP_DIR"
  sudo -u "$APP_USER" git clone "$REPO_URL" "$APP_DIR"
else
  sudo -u "$APP_USER" git -C "$APP_DIR" fetch origin
  sudo -u "$APP_USER" git -C "$APP_DIR" reset --hard origin/main
fi

echo "==> installing dependencies"
cd "$APP_DIR"
sudo -u "$APP_USER" pnpm install --frozen-lockfile

echo "==> installing Playwright Chromium + system libs"
sudo -u "$APP_USER" pnpm --filter @pookie/worker exec playwright install --with-deps chromium

echo "==> initializing SQLite database"
sudo -u "$APP_USER" mkdir -p "$APP_DIR/.pookie/screenshots" "$APP_DIR/.pookie/session"
sudo -u "$APP_USER" pnpm --filter @pookie/db migrate || true

echo "==> creating .env if missing"
if [ ! -f "$APP_DIR/.env" ]; then
  if [ -f "$APP_DIR/.env.example" ]; then
    sudo -u "$APP_USER" cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  else
    sudo -u "$APP_USER" touch "$APP_DIR/.env"
  fi
  echo "    !! Edit $APP_DIR/.env and set GOOGLE_GENAI_API_KEY before next reboot"
fi

echo "==> building web app"
sudo -u "$APP_USER" pnpm --filter @pookie/web build

echo "==> installing systemd units"
install -m 0644 "$APP_DIR/deploy/pookie-worker.service" /etc/systemd/system/pookie-worker.service
install -m 0644 "$APP_DIR/deploy/pookie-web.service" /etc/systemd/system/pookie-web.service
systemctl daemon-reload
systemctl enable --now pookie-worker.service
systemctl enable --now pookie-web.service

echo "==> installing nginx site"
install -m 0644 "$APP_DIR/deploy/nginx.conf" /etc/nginx/sites-available/pookie
ln -sf /etc/nginx/sites-available/pookie /etc/nginx/sites-enabled/pookie
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "==> firewall (ufw): 22, 80, 443"
ufw allow OpenSSH || true
ufw allow 'Nginx Full' || true
yes | ufw enable || true

echo
echo "✓ pookie is up."
echo
echo "Next:"
echo "  1. Edit $APP_DIR/.env and add GOOGLE_GENAI_API_KEY, then:"
echo "       systemctl restart pookie-worker pookie-web"
echo "  2. Point your domain's A record at this server's IP."
echo "  3. Run TLS:"
echo "       apt-get install -y certbot python3-certbot-nginx"
echo "       certbot --nginx -d yourdomain.com"
echo "  4. Visit http://<server-ip> (or your domain) and onboard."
echo
echo "Logs:"
echo "  journalctl -u pookie-worker -f"
echo "  journalctl -u pookie-web -f"
