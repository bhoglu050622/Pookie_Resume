import { Wizard } from "./wizard";
import { worker } from "../../lib/worker";

export const dynamic = "force-dynamic";

async function load() {
  try {
    const status = await worker.status();
    return { status, error: null as string | null };
  } catch (e: any) {
    return { status: null, error: e?.message ?? "Worker offline" };
  }
}

export default async function OnboardingPage() {
  const { status, error } = await load();
  return (
    <div className="max-w-[760px]">
      <h1 className="text-3xl">Welcome Marina, my happiness, my boo, my lu buu do bu and my pookie</h1>
      <p className="mt-2 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
        Four quick steps and we'll start applying for you.
      </p>

      {error && (
        <div className="card mt-6" style={{ borderColor: "var(--color-warn)" }}>
          <div className="font-medium">Worker offline.</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--color-ink-soft)" }}>
            Run <code>pnpm dev:worker</code> in another terminal.
          </div>
        </div>
      )}

      {status && <Wizard initialStatus={status} />}
    </div>
  );
}
