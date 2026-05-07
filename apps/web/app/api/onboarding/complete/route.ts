import { NextRequest, NextResponse } from "next/server";
import { getSqlite } from "@pookie/db";
import { Settings } from "@pookie/db/queries.js";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sqlite = getSqlite();

  // Question bank
  const upsert = sqlite.prepare(
    `INSERT INTO question_bank (key, value, ts) VALUES (?, ?, unixepoch()*1000)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, ts=excluded.ts`
  );
  for (const [k, v] of Object.entries(body.bank ?? {})) upsert.run(k, String(v));

  // Search filters: deactivate old, insert new
  sqlite.prepare("UPDATE search_filters SET active = 0").run();
  sqlite.prepare(
    `INSERT INTO search_filters (keywords, locations, remote, posted_within_days, exclusions, active)
     VALUES (?, ?, ?, ?, ?, 1)`
  ).run(
    JSON.stringify(body.keywords ?? []),
    JSON.stringify(body.locations ?? []),
    body.remote ? 1 : 0,
    Number(body.postedDays ?? 7),
    JSON.stringify(body.exclusions ?? [])
  );

  Settings.set("onboarded", true);
  Settings.set("shadow_started_at", Date.now());
  Settings.set("mode", "shadow");

  return NextResponse.json({ ok: true });
}
