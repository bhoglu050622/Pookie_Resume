import { NextResponse } from "next/server";
import { worker } from "../../../lib/worker";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await worker.status();
    return NextResponse.json(s);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "worker offline" }, { status: 503 });
  }
}
