import { NextRequest, NextResponse } from "next/server";
import { worker } from "../../../../lib/worker";
import { IS_DEMO } from "../../../../lib/demo";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const cookies = Array.isArray(body?.cookies) ? body.cookies : Array.isArray(body) ? body : [];
  if (cookies.length === 0) return NextResponse.json({ error: "no cookies" }, { status: 400 });
  if (IS_DEMO) return NextResponse.json({ ok: true, count: cookies.length, signed_in: true, demo: true });
  try {
    return NextResponse.json(await worker.loginCookies(cookies));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
