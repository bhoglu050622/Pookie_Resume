// Browserbase integration: creates a remote browser session that the user can
// drive interactively (via the live URL) for sign-in, then keeps the cookies
// in a persistent Browserbase Context so subsequent worker actions stay
// signed in. We connect Playwright to that session via CDP.
//
// Required env:
//   BROWSERBASE_API_KEY     — Browserbase API key (bb_live_...)
//   BROWSERBASE_PROJECT_ID  — Browserbase project ID (uuid)
//   BROWSERBASE_CONTEXT_ID  — (set by us once on first run, then reused)

import Browserbase from "@browserbasehq/sdk";
import { Settings } from "@pookie/db/queries.js";
import { log } from "./log.js";

export function isBrowserbaseEnabled(): boolean {
  return !!process.env.BROWSERBASE_API_KEY && !!process.env.BROWSERBASE_PROJECT_ID;
}

let _bb: Browserbase | null = null;
function bb(): Browserbase {
  if (_bb) return _bb;
  if (!process.env.BROWSERBASE_API_KEY) throw new Error("BROWSERBASE_API_KEY not set");
  _bb = new Browserbase({ apiKey: process.env.BROWSERBASE_API_KEY });
  return _bb;
}

/**
 * Returns a Browserbase Context ID. Creates one on first call and persists it
 * via the `bb_context_id` setting so cookies live across sessions/restarts.
 */
export async function getOrCreateContextId(): Promise<string> {
  const stored = Settings.get<string | null>("bb_context_id", null);
  if (stored) return stored;
  if (process.env.BROWSERBASE_CONTEXT_ID) {
    Settings.set("bb_context_id", process.env.BROWSERBASE_CONTEXT_ID);
    return process.env.BROWSERBASE_CONTEXT_ID;
  }
  const ctx = await bb().contexts.create({ projectId: process.env.BROWSERBASE_PROJECT_ID! });
  log.info({ contextId: ctx.id }, "created browserbase context");
  Settings.set("bb_context_id", ctx.id);
  return ctx.id;
}

export interface BBSession {
  id: string;
  connectUrl: string;
  liveUrl: string;
  contextId: string;
}

/** Create a new Browserbase session attached to our persistent context. */
export async function createSession(opts: { keepAlive?: boolean } = {}): Promise<BBSession> {
  const contextId = await getOrCreateContextId();
  const projectId = process.env.BROWSERBASE_PROJECT_ID!;

  const session = await bb().sessions.create({
    projectId,
    keepAlive: opts.keepAlive ?? true,
    browserSettings: {
      context: { id: contextId, persist: true },
      viewport: { width: 1440, height: 900 },
      // Realistic locale/timezone so LinkedIn doesn't get suspicious.
      // Note: viewport via Browserbase may differ slightly from local.
    },
  } as any);

  // The live URL lets the human user drive the browser (sign-in flow).
  const liveResp = await bb().sessions.debug(session.id);
  return {
    id: session.id,
    connectUrl: session.connectUrl,
    liveUrl: liveResp.debuggerFullscreenUrl ?? liveResp.debuggerUrl ?? "",
    contextId,
  };
}

export async function getSession(sessionId: string) {
  return await bb().sessions.retrieve(sessionId);
}

export async function endSession(sessionId: string) {
  try {
    await bb().sessions.update(sessionId, {
      projectId: process.env.BROWSERBASE_PROJECT_ID!,
      status: "REQUEST_RELEASE",
    } as any);
  } catch (e: any) {
    log.warn({ err: e?.message, sessionId }, "failed to release browserbase session");
  }
}

/** Delete the stored context — forces a fresh one (and a fresh login) next time. */
export async function resetContext() {
  Settings.set("bb_context_id", null);
}
