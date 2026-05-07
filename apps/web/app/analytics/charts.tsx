"use client";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line, Cell,
} from "recharts";

const COLORS = ["#E8788C", "#7BAE8E", "#E8A87C", "#A56FB6"];

export function AnalyticsCharts({ data }: { data: any }) {
  const byResume = (data.byResume ?? []).map((r: any) => ({
    name: r.resume_key,
    submitted: r.submitted,
    replied: r.replied,
    interview: r.interview,
    rate: r.submitted ? Math.round((100 * r.replied) / r.submitted) : 0,
  }));

  const tod = Array.from({ length: 24 }, (_, h) => {
    const r = (data.tod ?? []).find((x: any) => Number(x.hour) === h);
    const sent = r?.sent ?? 0;
    const replied = r?.replied ?? 0;
    return { hour: h, sent, rate: sent ? Math.round((100 * replied) / sent) : 0 };
  });

  return (
    <div className="grid grid-cols-2 gap-6">
      <div className="card">
        <h3 className="text-lg font-medium mb-4">Reply rate by resume</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byResume}>
              <CartesianGrid stroke="#F0E2DD" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6B5963" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B5963" }} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{ background: "white", border: "1px solid #F0E2DD", borderRadius: 10, fontSize: 12 }}
                formatter={(v: any, k: any) => (k === "rate" ? `${v}%` : v)}
              />
              <Bar dataKey="rate" fill="#E8788C" radius={[8, 8, 0, 0]} name="Reply rate %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card">
        <h3 className="text-lg font-medium mb-4">Volume per resume</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byResume}>
              <CartesianGrid stroke="#F0E2DD" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#6B5963" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B5963" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #F0E2DD", borderRadius: 10, fontSize: 12 }} />
              <Bar dataKey="submitted" fill="#F4B7C4" radius={[8, 8, 0, 0]} name="Submitted">
                {byResume.map((_: any, i: number) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card col-span-2">
        <h3 className="text-lg font-medium mb-4">Time of day · reply rate</h3>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tod}>
              <CartesianGrid stroke="#F0E2DD" vertical={false} />
              <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "#6B5963" }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#6B5963" }} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "white", border: "1px solid #F0E2DD", borderRadius: 10, fontSize: 12 }} />
              <Line type="monotone" dataKey="rate" stroke="#E8788C" strokeWidth={2} dot={{ r: 3, fill: "#E8788C" }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
