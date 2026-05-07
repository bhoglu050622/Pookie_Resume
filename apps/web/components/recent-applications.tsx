"use client";
import { Building2, MapPin, Heart } from "lucide-react";

const STATUS_PILL: Record<string, { label: string; cls: string }> = {
  submitted: { label: "Submitted", cls: "pill-success" },
  shadow: { label: "Shadow", cls: "pill-info" },
  awaiting_review: { label: "Needs review", cls: "pill-warn" },
  failed: { label: "Failed", cls: "" },
  skipped: { label: "Skipped", cls: "" },
  replied: { label: "Replied", cls: "pill-success" },
  interview: { label: "Interview", cls: "pill-success" },
  filling: { label: "Filling…", cls: "pill-info" },
  queued: { label: "Queued", cls: "pill-info" },
};

export function RecentApplications({ items }: { items: any[] }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-medium">Recent</h3>
        <span style={{ color: "var(--color-ink-soft)", fontSize: 13 }}>last 10</span>
      </div>
      {items.length === 0 ? (
        <div
          className="text-center py-12 text-sm"
          style={{ color: "var(--color-ink-soft)" }}
        >
          <div className="mb-2">No applications yet.</div>
          <div className="text-[13px]">When pookie applies, you'll see them here.</div>
        </div>
      ) : (
        <div className="flex flex-col divide-y" style={{ borderColor: "var(--color-border)" }}>
          {items.map((a) => {
            const st = STATUS_PILL[a.status] ?? { label: a.status, cls: "" };
            return (
              <div key={a.id} className="flex items-center justify-between py-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{a.job_title}</div>
                  <div
                    className="text-[12px] mt-0.5 flex items-center gap-2"
                    style={{ color: "var(--color-ink-soft)" }}
                  >
                    <Building2 size={12} />
                    {a.company}
                    {a.location && (
                      <>
                        <span>·</span>
                        <MapPin size={12} />
                        {a.location}
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
                    {a.resume_key}
                  </span>
                  <span className={"pill " + st.cls}>
                    {a.status === "submitted" && (
                      <Heart size={11} fill="currentColor" stroke="none" className="opacity-80" />
                    )}
                    {st.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
