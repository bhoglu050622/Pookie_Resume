import { NextResponse } from "next/server";
import { worker } from "../../../lib/worker";
import { IS_DEMO, demoStatus } from "../../../lib/demo";

export const dynamic = "force-dynamic";

export async function GET() {
  if (IS_DEMO) return NextResponse.json(demoStatus);
  try {
    const s = await worker.status();
    return NextResponse.json(s);
  } catch {
    return NextResponse.json(demoStatus);
  }
}
