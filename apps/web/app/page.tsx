import Link from "next/link";
import { redirect } from "next/navigation";
import { Funnel } from "../components/funnel";
import { Sparkline } from "../components/sparkline";
import { RecentApplications } from "../components/recent-applications";
import { ModeBanner } from "../components/mode-banner";
import { worker } from "../lib/worker";

export const dynamic = "force-dynamic";

async function getData() {
  try {
    const [status, dash] = await Promise.all([worker.status(), worker.dashboard()]);
    return { status, dash, error: null as string | null };
  } catch (e: any) {
    return { status: null, dash: null, error: e?.message ?? "Worker unavailable" };
  }
}

export default async function DashboardPage() {
  const { status, dash, error } = await getData();

  if (status && !status.onboarded) redirect("/onboarding");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-3xl">Hi, Marina</h1>
          <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
            {status?.daily_count ?? 0} of {status?.daily_cap ?? 22} applications today.
          </p>
        </div>
        <Link href="/review" className="btn btn-ghost">
          Review queue
          {dash?.awaiting > 0 && (
            <span className="pill pill-warn ml-1">{dash.awaiting}</span>
          )}
        </Link>
      </header>

      {error && (
        <div className="card" style={{ borderColor: "var(--color-warn)" }}>
          <div className="font-medium mb-1">Worker is offline.</div>
          <div className="text-[13px]" style={{ color: "var(--color-ink-soft)" }}>
            Run <code>pnpm dev:worker</code> in another terminal — the dashboard pulls live data from it.
          </div>
        </div>
      )}

      {status && <ModeBanner status={status} />}

      {dash && (
        <>
          <Funnel data={dash.funnel} />
          <div className="grid grid-cols-2 gap-6">
            <Sparkline data={dash.sparkline} />
            <div className="card">
              <h3 className="text-lg font-medium mb-4">Quick actions</h3>
              <div className="flex flex-col gap-2">
                <form action="/api/control/start" method="POST">
                  <button className="btn btn-primary w-full" type="submit">Start a discovery run</button>
                </form>
                <form action="/api/control/pause" method="POST">
                  <button className="btn btn-ghost w-full" type="submit">Pause pookie</button>
                </form>
              </div>
              <p className="text-[12px] mt-4" style={{ color: "var(--color-ink-soft)" }}>
                Discovery scans LinkedIn for fresh Easy-Apply jobs that match your filters and queues them for application.
              </p>
            </div>
          </div>
          <RecentApplications items={dash.last} />
        </>
      )}
    </div>
  );
}
