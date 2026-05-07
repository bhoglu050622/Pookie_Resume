import { ReviewList } from "./review-list";
import { worker } from "../../lib/worker";
import { IS_DEMO, demoAwaiting } from "../../lib/demo";

export const dynamic = "force-dynamic";

async function loadItems(): Promise<{ items: any[]; demo: boolean }> {
  if (IS_DEMO) return { items: demoAwaiting, demo: true };
  try {
    return { items: await worker.awaiting(), demo: false };
  } catch {
    return { items: demoAwaiting, demo: true };
  }
}

export default async function ReviewPage() {
  const { items, demo } = await loadItems();
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl">Review queue</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
          {items.length} {items.length === 1 ? "application" : "applications"} ready for your call.
        </p>
      </header>
      {demo && (
        <div className="card mb-4" style={{ borderColor: "var(--color-accent)", background: "var(--color-surface-2)" }}>
          <div className="font-medium">Preview mode</div>
          <div className="text-[13px] mt-1" style={{ color: "var(--color-ink-soft)" }}>
            Sample queue. Run the local worker to review real applications.
          </div>
        </div>
      )}
      <ReviewList initial={items} />
    </div>
  );
}
