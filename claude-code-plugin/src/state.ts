import * as crypto from "node:crypto";
import * as fs from "node:fs";
import lockfile from "proper-lockfile";
import { lockFile, stateDir, stateFile } from "./config.js";
import { info } from "./logger.js";
import type { Row } from "./types.js";

export type GlobalState = Record<string, any>;

/** Per-session state persisted between hook runs. */
export class SessionState {
  offset: number; // Last byte read from the transcript file.
  buffer: string; // Partial JSONL line kept between hook runs.
  turnCount: number; // Turns already emitted for this session.
  pendingAgentTurns: Row[];
  // Task-notification rows whose tool_use_id could not be resolved yet
  // (task-id-only and the subagent meta.json not on disk); retried each run.
  pendingTaskNotifications: Row[];
  // Raw rows of an incomplete trailing turn (a user prompt whose assistant
  // response has not been written yet) held back so the next hook run re-reads
  // it together with the response. Guards against the transcript being flushed
  // between the Stop hook firing and the assistant row landing.
  pendingTurnRows: Row[];

  constructor(init: Partial<SessionState> = {}) {
    this.offset = init.offset ?? 0;
    this.buffer = init.buffer ?? "";
    this.turnCount = init.turnCount ?? 0;
    this.pendingAgentTurns = init.pendingAgentTurns ?? [];
    this.pendingTaskNotifications = init.pendingTaskNotifications ?? [];
    this.pendingTurnRows = init.pendingTurnRows ?? [];
  }
}

export function loadHookState(): GlobalState {
  try {
    const file = stateFile();
    if (!fs.existsSync(file)) {
      return {};
    }
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return {};
  }
}

export function getSessionStateKey(sessionId: string, transcriptPath: string): string {
  // Stable key even if session_id collides.
  const raw = `${sessionId}::${transcriptPath}`;
  return crypto.createHash("sha256").update(raw, "utf-8").digest("hex");
}

export function getSessionState(globalState: GlobalState, key: string): SessionState {
  const s = globalState[key] ?? {};
  const pendingAgentTurns = Array.isArray(s.pending_agent_turns) ? s.pending_agent_turns : [];
  const pendingTaskNotifications = Array.isArray(s.pending_task_notifications) ? s.pending_task_notifications : [];
  const pendingTurnRows = Array.isArray(s.pending_turn_rows) ? s.pending_turn_rows : [];
  return new SessionState({
    offset: Number(s.offset ?? 0),
    buffer: String(s.buffer ?? ""),
    turnCount: Number(s.turn_count ?? 0),
    pendingAgentTurns,
    pendingTaskNotifications,
    pendingTurnRows,
  });
}

export function updateSessionState(globalState: GlobalState, key: string, sessionState: SessionState): void {
  // Persisted key names match the Python plugin so an in-place upgrade keeps
  // the existing offset instead of re-emitting the whole session.
  globalState[key] = {
    offset: sessionState.offset,
    buffer: sessionState.buffer,
    turn_count: sessionState.turnCount,
    pending_agent_turns: sessionState.pendingAgentTurns || [],
    pending_task_notifications: sessionState.pendingTaskNotifications || [],
    pending_turn_rows: sessionState.pendingTurnRows || [],
    updated: new Date().toISOString(),
  };
}

export function saveHookState(state: GlobalState): void {
  try {
    // Drop session entries older than 30 days to keep the file bounded.
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    for (const k of Object.keys(state)) {
      const entry = state[k];
      if (typeof entry !== "object" || entry === null) {
        continue;
      }
      const updated = entry.updated;
      if (typeof updated !== "string") {
        continue;
      }
      const ts = Date.parse(updated);
      if (Number.isNaN(ts)) {
        continue;
      }
      if (ts < cutoff) {
        delete state[k];
      }
    }
    const file = stateFile();
    fs.mkdirSync(stateDir(), { recursive: true });
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(state, null, 2), "utf-8");
    fs.renameSync(tmp, file);
  } catch (e) {
    // Fail-open: never throw. Exports can't be rolled back, so a failed state
    // write after a successful export means those turns will be re-emitted as
    // duplicate traces on the next hook run (at-least-once).
    info(
      `saveHookState failed: ${e}; state not persisted — ` +
        "already-exported turns may be re-emitted as duplicates on the next hook run"
    );
  }
}

export function saveSessionState(globalState: GlobalState, key: string, sessionState: SessionState): void {
  updateSessionState(globalState, key, sessionState);
  saveHookState(globalState);
}

/**
 * Advisory lock over the shared state file so concurrent hook runs don't
 * corrupt it. Throws on failure (caller fails open, exits 0), mirroring the
 * Python FileLock's TimeoutError path.
 */
export async function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = lockFile();
  fs.mkdirSync(stateDir(), { recursive: true });
  // proper-lockfile stats the target, so it must exist.
  try {
    fs.closeSync(fs.openSync(lock, "a"));
  } catch {
    // If we can't even create the lock file, run without a lock (fail-open).
    return fn();
  }
  let release: (() => Promise<void>) | null = null;
  try {
    release = await lockfile.lock(lock, {
      realpath: false,
      stale: 30_000,
      // ~2s of polling (40 * 50ms), matching the Python 2s lock timeout.
      retries: { retries: 40, minTimeout: 50, maxTimeout: 50 },
    });
    return await fn();
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // Ignore release failures.
      }
    }
  }
}
