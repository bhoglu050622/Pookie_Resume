import { NextResponse } from "next/server";
import { worker } from "../../../lib/worker";
import { IS_DEMO } from "../../../lib/demo";

export async function POST() {
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true, stdout: "preview mode — parse skipped" });
  try {
    return NextResponse.json(await worker.parseResumes());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
