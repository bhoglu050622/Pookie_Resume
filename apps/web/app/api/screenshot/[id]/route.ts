import { NextRequest, NextResponse } from "next/server";

const BASE = process.env.WORKER_URL
  ? process.env.WORKER_URL.replace(/\/$/, "")
  : `http://127.0.0.1:${process.env.WORKER_PORT ?? "3001"}`;

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const res = await fetch(`${BASE}/screenshot/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!res.ok) return NextResponse.json({ error: "not found" }, { status: 404 });
    const buf = Buffer.from(await res.arrayBuffer());
    return new NextResponse(buf, {
      status: 200,
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "worker offline" }, { status: 502 });
  }
}
