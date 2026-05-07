"use client";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from "recharts";

export function Sparkline({ data }: { data: Array<{ day: string; count: number }> }) {
  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-medium">This week</h3>
        <span className="pill pill-info">
          {data.reduce((a, b) => a + b.count, 0)} submitted
        </span>
      </div>
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E8788C" stopOpacity={0.32} />
                <stop offset="100%" stopColor="#E8788C" stopOpacity={0.04} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="count" stroke="#E8788C" strokeWidth={2} fill="url(#g1)" />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11, fill: "#6B5963" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(d) => d.slice(5)}
            />
            <YAxis hide />
            <Tooltip
              contentStyle={{
                background: "white",
                border: "1px solid #F0E2DD",
                borderRadius: 10,
                fontSize: 12,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
