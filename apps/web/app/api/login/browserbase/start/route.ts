import { NextResponse } from "next/server";
import { worker } from "../../../../../lib/worker";
import { IS_DEMO } from "../../../../../lib/demo";

export async function POST() {
  if (IS_DEMO) return NextResponse.json({ ok: true, sessionId: "demo", liveUrl: "https://www.browserbase.com/" });
  try {
    return NextResponse.json(await worker.bbStart());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
