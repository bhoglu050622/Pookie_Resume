import { NextResponse } from "next/server";
import { worker } from "../../../../../lib/worker";
import { IS_DEMO } from "../../../../../lib/demo";

export async function GET() {
  if (IS_DEMO) return NextResponse.json({ signed_in: true });
  try {
    return NextResponse.json(await worker.bbStatus());
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
