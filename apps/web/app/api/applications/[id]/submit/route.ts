import { NextRequest, NextResponse } from "next/server";
import { worker } from "../../../../../lib/worker";
import { IS_DEMO } from "../../../../../lib/demo";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (IS_DEMO) return NextResponse.json({ ok: true, demo: true });
  try {
    await worker.submitApplication(Number(id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
