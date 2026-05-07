import { getContext } from "../stealth.js";
import { Settings, Events } from "@pookie/db/queries.js";
import { log, emit } from "../log.js";
import { notify } from "../notify.js";

/**
 * Opens a headed browser to LinkedIn. If the persistent session is already logged in
 * (we'll detect /feed/), we just confirm. Otherwise we send the user to /login and
 * wait for them to finish (they handle email/password/2FA themselves).
 *
 * This function returns once we observe a logged-in session. It does NOT close the browser.
 */
export async function ensureLoggedIn(timeoutMs = 5 * 60 * 1000): Promise<boolean> {
  const ctx = await getContext();
  let page = ctx.pages()[0] ?? (await ctx.newPage());

  emit("login:check", {});
  await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded" });

  // Wait briefly for either feed or login redirect
  await page.waitForLoadState("networkidle").catch(() => {});

  if (await isLoggedIn(page)) {
    log.info("already logged in");
    Settings.set("session_logged_in", true);
    Events.log("login:already");
    emit("login:ok", { already: true });
    return true;
  }

  log.info("not logged in — sending to /login");
  notify("Sign in to LinkedIn", "A browser window opened. Please sign in (Pookie will wait).");
  emit("login:waiting", {});
  await page.goto("https://www.linkedin.com/login");

  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 2500));
    if (await isLoggedIn(page)) {
      Settings.set("session_logged_in", true);
      Events.log("login:success");
      emit("login:ok", { already: false });
      notify("Signed in", "LinkedIn session captured. Pookie can take it from here.");
      return true;
    }
    // Detect security checkpoint
    const url = page.url();
    if (url.includes("/checkpoint") || url.includes("/uas/login-submit") || url.includes("captcha")) {
      emit("login:checkpoint", { url });
    }
  }
  emit("login:timeout", {});
  return false;
}

async function isLoggedIn(page: import("playwright").Page): Promise<boolean> {
  // The feed URL is the canonical signed-in landing.
  if (page.url().includes("/feed")) return true;
  // Heuristic: presence of the global nav profile menu.
  const navMe = await page.locator('a[data-control-name="identity_welcome_message"], img.global-nav__me-photo').count().catch(() => 0);
  return navMe > 0;
}
