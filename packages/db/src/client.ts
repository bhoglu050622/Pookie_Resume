import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema.js";

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;
let _sqlite: Database.Database | null = null;

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}

function resolveDbPath(): string {
  const root = findWorkspaceRoot();
  // DB_PATH may be absolute or relative; relative is anchored to the workspace root,
  // not the current cwd (since cwd varies by process: web=apps/web, worker=apps/worker, etc.).
  if (process.env.DB_PATH) {
    const p = process.env.DB_PATH;
    return path.isAbsolute(p) ? p : path.join(root, p);
  }
  return path.join(root, ".pookie/pookie.db");
}

export function getDb() {
  if (_db) return _db;
  const dbPath = resolveDbPath();
  mkdirSync(path.dirname(dbPath), { recursive: true });
  _sqlite = new Database(dbPath);
  _sqlite.pragma("journal_mode = WAL");
  _sqlite.pragma("foreign_keys = ON");
  _db = drizzle(_sqlite, { schema });
  return _db;
}

export function getSqlite() {
  getDb();
  return _sqlite!;
}

export { schema };
export * from "./schema.js";
