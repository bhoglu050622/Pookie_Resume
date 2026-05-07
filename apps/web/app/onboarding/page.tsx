import { Wizard } from "./wizard";
import { worker } from "../../lib/worker";
import { IS_DEMO, demoStatus } from "../../lib/demo";

export const dynamic = "force-dynamic";

async function load() {
  if (IS_DEMO) return { status: demoStatus, demo: true };
  try {
    return { status: await worker.status(), demo: false };
  } catch {
    return { status: demoStatus, demo: true };
  }
}

export default async function OnboardingPage() {
  const { status, demo } = await load();
  return (
    <div className="max-w-[760px]">
      <h1 className="text-3xl">Welcome Marina, my happiness, my boo, my lu buu do bu and my pookie</h1>
      <p className="mt-2 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
        Four quick steps and we'll start applying for you.
      </p>

      {demo && (
        <div className="card mt-6" style={{ borderColor: "var(--color-accent)", background: "var(--color-surface-2)" }}>
          <div className="font-medium">Preview mode</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--color-ink-soft)" }}>
            This onboarding is a walkthrough. Run the local worker to save settings and apply for real.
          </div>
        </div>
      )}

      <Wizard initialStatus={status} />
    </div>
  );
}
