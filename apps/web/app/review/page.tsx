import { ReviewList } from "./review-list";
import { worker } from "../../lib/worker";

export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  let items: any[] = [];
  let error: string | null = null;
  try {
    items = await worker.awaiting();
  } catch (e: any) {
    error = e?.message ?? "Worker offline";
  }
  return (
    <div>
      <header className="mb-6">
        <h1 className="text-3xl">Review queue</h1>
        <p className="mt-1 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
          {items.length} {items.length === 1 ? "application" : "applications"} ready for your call.
        </p>
      </header>
      {error && (
        <div className="card" style={{ borderColor: "var(--color-warn)" }}>
          {error}
        </div>
      )}
      <ReviewList initial={items} />
    </div>
  );
}
