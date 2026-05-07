import { NextResponse } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

export async function POST() {
  return new Promise<NextResponse>((resolve) => {
    const root = path.resolve(process.cwd(), "../..");
    const proc = spawn("pnpm", ["--filter", "@pookie/profile", "parse"], {
      cwd: root,
      env: process.env,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (b) => (stdout += b.toString()));
    proc.stderr.on("data", (b) => (stderr += b.toString()));
    proc.on("close", (code) => {
      if (code === 0) resolve(NextResponse.json({ ok: true, stdout }));
      else resolve(NextResponse.json({ error: stderr || stdout || `exit ${code}` }, { status: 500 }));
    });
  });
}
