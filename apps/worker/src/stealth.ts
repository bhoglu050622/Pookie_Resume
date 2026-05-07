import { chromium as baseChromium, type BrowserContext, type Page } from "playwright";
import { addExtra } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import path from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { log } from "./log.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const chromium = addExtra(baseChromium as any);
chromium.use(StealthPlugin());

let _context: BrowserContext | null = null;

function profileDir(): string {
  const root = path.resolve(__dirname, "../../..");
  const dir = process.env.PERSISTENT_PROFILE_DIR
    ? path.resolve(process.env.PERSISTENT_PROFILE_DIR)
    : path.join(root, ".pookie/session");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export async function getContext(): Promise<BrowserContext> {
  if (_context) return _context;
  const dir = profileDir();
  log.info({ dir }, "launching persistent chrome");
  _context = await chromium.launchPersistentContext(dir, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: "en-IN",
    timezoneId: "Asia/Kolkata",
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process",
    ],
  });
  // playwright-extra may have already created a page when persistent context launches
  // Don't proactively create one — the orchestrator will.
  return _context;
}

export async function closeContext() {
  if (_context) {
    try { await _context.close(); } catch { /* ignore */ }
    _context = null;
  }
}

// ---- Humanization helpers ----

function gaussian(mean: number, std: number): number {
  // Box–Muller
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  const n = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  return mean + std * n;
}

export function humanDelayMs(meanMs = 1400, stdMs = 600, minMs = 400, maxMs = 4000): number {
  return Math.max(minMs, Math.min(maxMs, gaussian(meanMs, stdMs)));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function humanWait(meanMs = 1400, stdMs = 600) {
  await sleep(humanDelayMs(meanMs, stdMs));
}

export async function humanType(page: Page, locatorOrSelector: any, text: string) {
  const el = typeof locatorOrSelector === "string" ? page.locator(locatorOrSelector).first() : locatorOrSelector;
  await el.click();
  // Clear if there's existing text
  await page.keyboard.press("Meta+A").catch(() => {});
  await page.keyboard.press("Delete").catch(() => {});
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: humanDelayMs(80, 30, 30, 200) });
  }
}

// Simple approximation of bezier mouse movement.
export async function humanMouseMove(page: Page, to: { x: number; y: number }) {
  const steps = Math.floor(20 + Math.random() * 20);
  // Start at current cursor (Playwright doesn't expose it; we approximate from viewport center jitter).
  const fromX = 720 + Math.random() * 80;
  const fromY = 450 + Math.random() * 80;
  const cx = (fromX + to.x) / 2 + (Math.random() - 0.5) * 120;
  const cy = (fromY + to.y) / 2 + (Math.random() - 0.5) * 120;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) * (1 - t) * fromX + 2 * (1 - t) * t * cx + t * t * to.x;
    const y = (1 - t) * (1 - t) * fromY + 2 * (1 - t) * t * cy + t * t * to.y;
    await page.mouse.move(x, y);
    await sleep(8 + Math.random() * 12);
  }
}

export async function humanClick(page: Page, locator: any) {
  const box = await locator.boundingBox();
  if (box) {
    const x = box.x + box.width / 2 + (Math.random() - 0.5) * box.width * 0.4;
    const y = box.y + box.height / 2 + (Math.random() - 0.5) * box.height * 0.4;
    await humanMouseMove(page, { x, y });
    await sleep(humanDelayMs(180, 60, 80, 400));
    await page.mouse.click(x, y);
  } else {
    await locator.click();
  }
}

// Time-of-day guard: avoid 1–6am IST (looks botty).
export function isQuietHourIST(now = new Date()): boolean {
  const h = Number(new Intl.DateTimeFormat("en-US", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }).format(now));
  return h >= 1 && h < 6;
}
