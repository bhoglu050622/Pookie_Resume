import { AnalyticsCharts } from "./charts";
import { worker } from "../../lib/worker";
import { IS_DEMO, demoAnalytics } from "../../lib/demo";

export const dynamic = "force-dynamic";

async function load() {
  if (IS_DEMO) return { data: demoAnalytics, demo: true };
  try {
    return { data: await worker.analytics(), demo: false };
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
            Sample analytics. Charts populate from your real applications when the worker is reachable (set <code>WORKER_URL</code>).
          </div>
        </div>
      )}
      <AnalyticsCharts data={data} />
    </div>
  );
}
