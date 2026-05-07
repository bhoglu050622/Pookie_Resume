import { NextRequest, NextResponse } from "next/server";
import { Settings } from "@pookie/db/queries.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  for (const [k, v] of Object.entries(body)) Settings.set(k, v);
  return NextResponse.json({ ok: true });
}
