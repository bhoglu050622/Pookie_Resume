# Pookie on Hostinger VPS

One-VM deploy: web + worker + sqlite + nginx, all on a single Hostinger KVM.

## What you need

- **Hostinger KVM 2 VPS** (or larger). Playwright Chromium needs ~2GB free RAM.
- **Ubuntu 22.04 or 24.04** OS image.
- **Root SSH** access (Hostinger emails the IP and password).
- **Gemini API key** — https://aistudio.google.com/apikey (free tier works).
- *(Optional)* a domain pointed at the VPS IP via an A record.

## One-shot install

```bash
ssh root@YOUR_VPS_IP

# clone the deploy script (or paste it via scp)
curl -fsSL https://raw.githubusercontent.com/bhoglu050622/Pookie_Resume/main/deploy/setup.sh -o /tmp/setup.sh
bash /tmp/setup.sh
```

The script:

1. Installs Node 20, pnpm, build tools, nginx, ufw
2. Creates a `pookie` system user
3. Clones the repo to `/opt/pookie`
4. Installs deps + Playwright Chromium with system libs
5. Migrates the SQLite schema
6. Builds the Next.js web app
7. Installs + starts `pookie-worker` and `pookie-web` systemd units
8. Configures nginx as reverse proxy to `127.0.0.1:3000`
9. Opens ports 22, 80, 443 via ufw

After it finishes, edit `/opt/pookie/.env`:

```bash
nano /opt/pookie/.env
# set GEMINI_API_KEY=...
systemctl restart pookie-worker pookie-web
```

Visit `http://YOUR_VPS_IP/` — the onboarding wizard appears.

## TLS (HTTPS via Let's Encrypt)

Once DNS A-record points at the VPS:

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d pookie.yourdomain.com
```

Certbot rewrites `/etc/nginx/sites-available/pookie` to add the TLS server
block and sets up auto-renewal.

## First-time LinkedIn login

The worker uses Playwright's persistent profile. LinkedIn 2FA requires a
headed browser the first time. Two options:

- **Easiest**: SSH-tunnel the worker's `/login` flow with X11 forwarding
  (`ssh -X root@vps`), or use a remote-desktop addon for one session.
- **Cleaner**: log in to LinkedIn locally on your laptop (`pnpm dev:worker` →
  Connect LinkedIn), then `rsync -av .pookie/session/ root@vps:/opt/pookie/.pookie/session/`.
  The cookies travel; LinkedIn stays logged in.

After cookies exist on the server, set `PLAYWRIGHT_HEADLESS=1` in `.env` and
restart `pookie-worker`.

## Day-to-day

```bash
# pull latest code, rebuild, restart
bash /opt/pookie/deploy/update.sh

# logs
journalctl -u pookie-worker -f
journalctl -u pookie-web -f

# restart
systemctl restart pookie-worker pookie-web

# status
systemctl status pookie-worker pookie-web
```

## File layout on the VPS

```
/opt/pookie/                       # repo checkout
  ├─ apps/web                      # Next.js
  ├─ apps/worker                   # Hono + Playwright
  ├─ packages/db                   # SQLite schema/queries
  ├─ resumes/                      # PDFs (commit your own or scp them in)
  ├─ .pookie/                      # persistent runtime state (chmod 700)
  │   ├─ pookie.db                 # SQLite
  │   ├─ session/                  # Chrome user profile (LinkedIn cookies)
  │   └─ screenshots/              # audit trail per application
  └─ .env                          # secrets (chmod 600)

/etc/systemd/system/pookie-worker.service
/etc/systemd/system/pookie-web.service
/etc/nginx/sites-available/pookie  → /etc/nginx/sites-enabled/pookie
```

## Sizing

| Hostinger plan | RAM | Verdict |
|---|---|---|
| KVM 1 (4GB) | 4GB | tight; Chromium OOMs under load |
| **KVM 2 (8GB)** | 8GB | **recommended** |
| KVM 4 (16GB) | 16GB | overkill unless you crank daily_cap |

## Troubleshooting

**Worker keeps restarting** → `journalctl -u pookie-worker -n 200`. Most
common: missing API key, missing `chromium` (re-run `pnpm exec playwright
install --with-deps chromium`), or `.pookie/` not writable by `pookie` user.

**Web shows "Worker is offline"** → worker not listening on `127.0.0.1:3001`.
Check `ss -ltnp | grep 3001`.

**LinkedIn says "browser not supported"** → cookies expired or stealth flag
mismatch. Re-do first-time login.

**OOM kills** → upgrade to KVM 2, or set `playwright` to launch with
`--single-process` (slower but lighter) in `apps/worker/src/stealth.ts`.
