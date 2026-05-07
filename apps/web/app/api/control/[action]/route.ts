import { NextRequest, NextResponse } from "next/server";
import { worker } from "../../../../lib/worker";
import { IS_DEMO } from "../../../../lib/demo";

const ALLOWED = new Set(["start", "pause", "resume", "login", "discover", "mode"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ action: string }> }) {
  const { action } = await ctx.params;
  if (!ALLOWED.has(action)) return NextResponse.json({ error: "unknown action" }, { status: 400 });

  if (IS_DEMO) return NextResponse.redirect(new URL("/", req.url), 303);

  let body: any = undefined;
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("application/json")) body = await req.json().catch(() => undefined);

  try {
    await worker.json(`/${action}`, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined });
    return NextResponse.redirect(new URL("/", req.url), 303);
  } catch {
    return NextResponse.redirect(new URL("/", req.url), 303);
  }
}
