import { NextRequest, NextResponse } from "next/server";
import { worker } from "../../../lib/worker";
import { IS_DEMO } from "../../../lib/demo";

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true });
  try {
    return NextResponse.json(await worker.setSettings(body));
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
