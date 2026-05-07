import { getSqlite } from "@pookie/db";
import { AnalyticsCharts } from "./charts";

export const dynamic = "force-dynamic";

async function load() {
  const sqlite = getSqlite();
  // Funnel by resume variant
  const byResume = sqlite.prepare(`
    SELECT resume_key,
      COUNT(*) AS total,
      SUM(CASE WHEN status='submitted' THEN 1 ELSE 0 END) AS submitted,
      SUM(CASE WHEN status='replied' OR status='interview' THEN 1 ELSE 0 END) AS replied,
      SUM(CASE WHEN status='interview' THEN 1 ELSE 0 END) AS interview
    FROM applications
    GROUP BY resume_key
  `).all();

  // Time-of-day cohort (hour of submitted_at -> reply rate)
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

  // Per-day submitted (last 30 days)
  const days = sqlite.prepare(`
    SELECT
      date(datetime(submitted_at/1000, 'unixepoch', 'localtime')) AS day,
      COUNT(*) AS n
    FROM applications WHERE submitted_at IS NOT NULL
    GROUP BY day ORDER BY day
  `).all() as any[];

  return { byResume, tod, days };
}

export default async function AnalyticsPage() {
  const data = await load();
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl">Analytics</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
          What's working, in three charts.
        </p>
      </header>
      <AnalyticsCharts data={data} />
    </div>
  );
}
