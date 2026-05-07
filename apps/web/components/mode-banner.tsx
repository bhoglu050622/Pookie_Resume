"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Heart, Sparkles } from "lucide-react";

export function ModeBanner({ status }: { status: any }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const shadowApprovals = status.shadow_approvals ?? 0;
  const shadowStarted = status.shadow_started_at;
  const days = shadowStarted ? Math.floor((Date.now() - shadowStarted) / (24 * 60 * 60 * 1000)) : 0;
  const eligibleForAuto = status.mode === "shadow" && (days >= 3 || shadowApprovals >= 30);

  async function setMode(mode: "shadow" | "auto") {
    setBusy(true);
    await fetch("/api/control/mode", { method: "POST", body: JSON.stringify({ mode }), headers: { "Content-Type": "application/json" } });
    router.refresh();
    setBusy(false);
  }

  if (status.mode === "shadow") {
    return (
      <div
        className="card flex items-center gap-4"
        style={{ background: "var(--color-surface-2)", borderColor: "var(--color-accent)" }}
      >
        <div className="grid place-items-center w-10 h-10 rounded-full" style={{ background: "white" }}>
          <Sparkles size={18} style={{ color: "var(--color-primary)" }} />
        </div>
        <div className="flex-1">
          <div className="font-medium">Shadow mode is on.</div>
          <div className="text-[13px]" style={{ color: "var(--color-ink-soft)" }}>
            Pookie fills every form but waits for you to click submit. {shadowApprovals} approved · {days} day{days === 1 ? "" : "s"} in.
          </div>
        </div>
        {eligibleForAuto && (
          <button className="btn btn-primary" disabled={busy} onClick={() => setMode("auto")}>
            <Heart size={14} fill="white" /> Fly solo
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-4" style={{ borderColor: "var(--color-success)" }}>
      <div className="grid place-items-center w-10 h-10 rounded-full" style={{ background: "var(--color-success)" }}>
        <Heart size={16} fill="white" stroke="white" />
      </div>
      <div className="flex-1">
        <div className="font-medium">Auto-submit is on.</div>
        <div className="text-[13px]" style={{ color: "var(--color-ink-soft)" }}>
          Pookie applies on your behalf. Daily cap: {status.daily_cap}.
        </div>
      </div>
      <button className="btn btn-ghost" disabled={busy} onClick={() => setMode("shadow")}>
        Switch to shadow
      </button>
    </div>
  );
}
