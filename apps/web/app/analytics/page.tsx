import { AnalyticsCharts } from "./charts";
import { IS_DEMO, demoAnalytics } from "../../lib/demo";

export const dynamic = "force-dynamic";

async function load() {
  if (IS_DEMO) return { data: demoAnalytics, demo: true };
  try {
    const { getSqlite } = await import("@pookie/db");
    const sqlite = getSqlite();
    const byResume = sqlite.prepare(`
      SELECT resume_key,
        COUNT(*) AS total,
        SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS submitted,
        SUM(CASE WHEN status='replied' OR status='interview' THEN 1 ELSE 0 END) AS replied,
        SUM(CASE WHEN status='interview' THEN 1 ELSE 0 END) AS interview
      FROM applications
      GROUP BY resume_key
    `).all();

    const tod = sqlite.prepare(`
      SELECT
        strftime('%H', datetime(submitted_at/1000, 'unixepoch', 'localtime')) AS hour,
        COUNT(*) AS sent,
        SUM(CASE WHEN status='replied' OR status='interview' THEN 1 ELSE 0 END) AS replied
      FROM applications
      WHERE submitted_at IS NOT NULL
      GROUP BY hour
      ORDER BY hour
    `).all() as any[];

    const days = sqlite.prepare(`
      SELECT
        date(datetime(submitted_at/1000, 'unixepoch', 'localtime')) AS day,
        COUNT(*) AS n
      FROM applications WHERE submitted_at IS NOT NULL
      GROUP BY day ORDER BY day
    `).all() as any[];

    return { data: { byResume, tod, days }, demo: false };
  } catch {
    return { data: demoAnalytics, demo: true };
  }
}

export default async function AnalyticsPage() {
  const { data, demo } = await load();
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl">Analytics</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
          What's working, in three charts.
        </p>
      </header>
      {demo && (
        <div className="card mb-4" style={{ borderColor: "var(--color-accent)", background: "var(--color-surface-2)" }}>
          <div className="font-medium">Preview mode</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--color-ink-soft)" }}>
            Sample analytics. Charts populate from your real applications when the local worker is running.
          </div>
        </div>
      )}
      <AnalyticsCharts data={data} />
    </div>
  );
}
