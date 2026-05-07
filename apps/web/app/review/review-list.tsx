"use client";
import { useState } from "react";
import { Building2, Check, X, ExternalLink, Loader2 } from "lucide-react";

export function ReviewList({ initial }: { initial: any[] }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<number | null>(null);

  async function submit(id: number) {
    setBusy(id);
    await fetch(`/api/applications/${id}/submit`, { method: "POST" });
    setItems((it) => it.filter((x) => x.id !== id));
    setBusy(null);
  }
  async function skip(id: number) {
    setBusy(id);
    await fetch(`/api/applications/${id}/skip`, { method: "POST" });
    setItems((it) => it.filter((x) => x.id !== id));
    setBusy(null);
  }

  if (!items.length) {
    return (
      <div className="card text-center py-12">
        <div className="text-lg mb-2" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          You're all caught up.
        </div>
        <div className="text-[13px]" style={{ color: "var(--color-ink-soft)" }}>
          When pookie fills a form, it'll show up here for your sign-off.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {items.map((a) => (
        <div key={a.id} className="card">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-medium">{a.job_title}</div>
              <div className="text-[13px] mt-1 flex items-center gap-2" style={{ color: "var(--color-ink-soft)" }}>
                <Building2 size={13} /> {a.company}
                {a.location && <><span>·</span>{a.location}</>}
                <span>·</span>
                <span className="pill">{a.resume_key}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a className="btn btn-ghost" href={a.job_url} target="_blank" rel="noreferrer">
                <ExternalLink size={13} /> Job
              </a>
              <button className="btn btn-ghost" disabled={busy === a.id} onClick={() => skip(a.id)}>
                <X size={13} /> Skip
              </button>
              <button className="btn btn-primary" disabled={busy === a.id} onClick={() => submit(a.id)}>
                {busy === a.id ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Submit
              </button>
            </div>
          </div>
          {a.cover_letter && (
            <div className="mt-3 p-3 rounded-[10px]" style={{ background: "var(--color-surface-2)" }}>
              <div className="text-[12px] mb-1" style={{ color: "var(--color-ink-soft)" }}>Cover letter</div>
              <div className="text-[13px] leading-relaxed">{a.cover_letter}</div>
            </div>
          )}
          {a.screenshot_path && (
            <div className="mt-3">
              <a
                href={`/api/screenshot/${a.id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[12px] underline"
                style={{ color: "var(--color-ink-soft)" }}
              >
                View form screenshot →
              </a>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
