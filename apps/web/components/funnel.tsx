"use client";
import { motion } from "framer-motion";

type FunnelData = {
  discovered: number;
  matched: number;
  filled: number;
  awaiting: number;
  submitted: number;
  replied: number;
};

const stages: Array<{ key: keyof FunnelData; label: string }> = [
  { key: "discovered", label: "Discovered" },
  { key: "matched", label: "Matched" },
  { key: "filled", label: "Filled" },
  { key: "awaiting", label: "To review" },
  { key: "submitted", label: "Submitted" },
  { key: "replied", label: "Replied" },
];

export function Funnel({ data }: { data: FunnelData }) {
  const max = Math.max(data.discovered, 1);
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium">Today's funnel</h3>
        <span className="pill">live</span>
      </div>
      <div className="grid grid-cols-6 gap-3">
        {stages.map((s, i) => {
          const v = data[s.key];
          const w = Math.max(0.18, v / max);
          return (
            <div key={s.key} className="flex flex-col gap-2">
              <div style={{ height: 110 }} className="relative flex flex-col justify-end">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${w * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.06 }}
                  style={{
                    background: i === 5 ? "var(--color-success)" : i === 4 ? "var(--color-primary)" : "var(--color-accent)",
                    borderRadius: 8,
                    width: "100%",
                  }}
                />
              </div>
              <div>
                <div className="stat-num" style={{ fontSize: 24 }}>
                  {v}
                </div>
                <div className="text-xs" style={{ color: "var(--color-ink-soft)" }}>
                  {s.label}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
