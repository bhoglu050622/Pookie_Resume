import { getContext, humanWait, sleep } from "../stealth.js";
import { ensureLoggedIn } from "./login.js";
import { getSqlite } from "@pookie/db";
import { Events } from "@pookie/db/queries.js";
import { log, emit } from "../log.js";

interface DiscoverParams {
  keywords: string[];
  locations: string[];
  remote: boolean;
  postedWithinDays: number;
  exclusions?: string[];
  perKeywordLimit?: number;
}

const POSTED_PARAM: Record<number, string> = {
  1: "r86400",   // 24h
  3: "r259200",
  7: "r604800",  // week
  30: "r2592000",
};

export async function discoverJobs(params: DiscoverParams) {
  const ok = await ensureLoggedIn();
  if (!ok) {
    emit("discover:skipped", { reason: "not logged in" });
    return { discovered: 0 };
  }

  const ctx = await getContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());

  const limit = params.perKeywordLimit ?? 25;
  const exclusionsLc = (params.exclusions ?? []).map((s) => s.toLowerCase());

  const sqlite = getSqlite();
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO jobs (linkedin_id, title, company, location, url, easy_apply, status)
     VALUES (?, ?, ?, ?, ?, 1, 'discovered')`
  );

  let total = 0;
  for (const location of params.locations) {
    for (const kw of params.keywords) {
      const url = new URL("https://www.linkedin.com/jobs/search");
      url.searchParams.set("keywords", kw);
      url.searchParams.set("location", location);
      url.searchParams.set("f_AL", "true"); // Easy Apply
      url.searchParams.set("f_TPR", POSTED_PARAM[params.postedWithinDays] ?? "r604800");
      if (params.remote) url.searchParams.set("f_WT", "2"); // remote

      log.info({ kw, location, url: url.toString() }, "discover:search");
      emit("discover:search", { kw, location });

      await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
      await humanWait(1800, 700);

      // Scroll the job list to load more cards
      await page.evaluate(async () => {
        const scrollEl =
          (document.querySelector("div.jobs-search-results-list") as HTMLElement | null) ||
          (document.querySelector("[data-results-list-top-scroll-sentinel]") as HTMLElement | null);
        if (!scrollEl) return;
        for (let i = 0; i < 6; i++) {
          scrollEl.scrollBy(0, 800);
          await new Promise((r) => setTimeout(r, 600));
        }
      });

      const cards = await page.$$eval(
        'li[data-occludable-job-id], div.job-card-container, li.scaffold-layout__list-item',
        (nodes) => {
          return nodes.slice(0, 30).map((el) => {
            const id =
              el.getAttribute("data-occludable-job-id") ||
              el.querySelector("[data-job-id]")?.getAttribute("data-job-id") ||
              "";
            const a = el.querySelector("a.job-card-list__title, a.job-card-container__link") as HTMLAnchorElement | null;
            const title = a?.innerText?.trim() ?? "";
            const company =
              (el.querySelector(".artdeco-entity-lockup__subtitle, .job-card-container__primary-description") as HTMLElement | null)?.innerText?.trim() ?? "";
            const location =
              (el.querySelector(".job-card-container__metadata-item, .artdeco-entity-lockup__caption") as HTMLElement | null)?.innerText?.trim() ?? "";
            const href = a?.href ?? "";
            return { id, title, company, location, href };
          });
        }
      ).catch(() => [] as any[]);

      let added = 0;
      for (const c of cards.slice(0, limit)) {
        if (!c.id || !c.title || !c.company) continue;
        const blob = `${c.title} ${c.company} ${c.location}`.toLowerCase();
        if (exclusionsLc.some((x) => blob.includes(x))) continue;
        const r = insert.run(c.id, c.title, c.company, c.location || null, c.href || `https://www.linkedin.com/jobs/view/${c.id}/`);
        if (r.changes > 0) {
          added++;
          total++;
          Events.log("job:discovered", { kw, location, id: c.id, title: c.title, company: c.company });
        }
      }
      emit("discover:added", { kw, location, added });
      await humanWait(2200, 800);
    }
  }

  return { discovered: total };
}

/** Hydrate a job's JD text by visiting its page. Skips if already populated. */
export async function hydrateJob(linkedinId: string): Promise<string | null> {
  const sqlite = getSqlite();
  const row = sqlite.prepare("SELECT id, jd_text, url FROM jobs WHERE linkedin_id = ?").get(linkedinId) as any;
  if (!row) return null;
  if (row.jd_text && row.jd_text.length > 200) return row.jd_text;

  const ctx = await getContext();
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto(row.url, { waitUntil: "domcontentloaded" });
  await humanWait(1500, 500);

  const jd = await page
    .locator(".jobs-description__content, .jobs-description-content__text, #job-details")
    .first()
    .innerText({ timeout: 8000 })
    .catch(() => "");

  if (jd) {
    sqlite.prepare("UPDATE jobs SET jd_text = ? WHERE id = ?").run(jd, row.id);
  }
  return jd || null;
}
