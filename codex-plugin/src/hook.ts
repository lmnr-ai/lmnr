/**
 * Codex -> Laminar hook
 *
 * Reads the Codex session rollout (JSONL transcript) incrementally when Codex
 * signals turn completion, assembles conversational turns, and emits them to
 * Laminar as OpenTelemetry traces over OTLP/HTTP/JSON.
 *
 * Two invocation modes:
 *  - Hooks system (Codex >= 0.144): `[[hooks.Stop]]` command handler; JSON
 *    payload on stdin including `transcript_path`.
 *  - Legacy `notify` config: `notify = [".../dist/hook.cjs"]`; JSON payload as
 *    the final argv argument (kebab-case, no transcript path — resolved by
 *    scanning ~/.codex/sessions for the thread id).
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getLaminarConfig } from "./config.js";
import { emitNewTurnsFromRollout } from "./emit.js";
import { debug, info } from "./logger.js";
import { findRolloutPathForThread } from "./rollout.js";
import { TraceEmitter } from "./tracer.js";
import type { Row } from "./types.js";

// ----------------- Hook payload -----------------
function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    // No stdin (e.g. a TTY, or legacy notify mode) — tolerate it.
    return "";
  }
}

function parsePayload(data: string): Row {
  if (!data.trim()) {
    return {};
  }
  try {
    const parsed = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    debug(`payload parse failed: ${e}`);
  }
  return {};
}

/**
 * Hooks-system payloads arrive on stdin; legacy notify passes the JSON as the
 * final argv argument. Try argv first (cheap), then stdin.
 */
function readHookPayload(): Row {
  const argvArg = process.argv[process.argv.length - 1];
  if (argvArg && argvArg.trimStart().startsWith("{")) {
    const payload = parsePayload(argvArg);
    if (Object.keys(payload).length > 0) {
      debug(`argv payload keys: ${Object.keys(payload).sort().join(", ")}`);
      return payload;
    }
  }
  const data = readStdin();
  debug(`stdin received ${data.length} chars`);
  const payload = parsePayload(data);
  if (Object.keys(payload).length > 0) {
    debug(`stdin payload keys: ${Object.keys(payload).sort().join(", ")}`);
  }
  return payload;
}

function expandUser(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

interface HookContext {
  sessionId: string;
  transcriptPath: string;
}

/**
 * Resolve session id + rollout path from either payload shape:
 *  - hooks system: { session_id, transcript_path, hook_event_name, ... }
 *  - legacy notify: { "type": "agent-turn-complete", "thread-id": ..., ... }
 */
function getHookContext(payload: Row): HookContext | null {
  const sessionId = payload.session_id || payload["thread-id"] || payload["session-id"] || null;
  if (!sessionId || typeof sessionId !== "string") {
    debug("Missing session/thread id in payload; exiting.");
    return null;
  }

  let transcriptPath: string | null = null;
  const rawPath = payload.transcript_path;
  if (typeof rawPath === "string" && rawPath) {
    transcriptPath = path.resolve(expandUser(rawPath));
  } else {
    // Legacy notify carries no path; find the rollout by thread id.
    transcriptPath = findRolloutPathForThread(sessionId);
    if (transcriptPath) {
      debug(`resolved rollout for thread ${sessionId}: ${transcriptPath}`);
    }
  }
  if (!transcriptPath || !fs.existsSync(transcriptPath)) {
    debug(`Rollout path missing or does not exist: ${transcriptPath}`);
    return null;
  }
  return { sessionId, transcriptPath };
}

function isTurnCompletionPayload(payload: Row): boolean {
  const hookEvent = payload.hook_event_name;
  if (typeof hookEvent === "string") {
    return hookEvent === "Stop" || hookEvent === "SubagentStop";
  }
  // Legacy notify only fires agent-turn-complete; accept unknown types too
  // (fail open towards processing — the parser only emits completed turns).
  return true;
}

// ----------------- Main -----------------
async function main(): Promise<number> {
  const start = Date.now();
  debug("Hook started");

  const config = getLaminarConfig();
  if (config === null) {
    return 0;
  }

  const payload = readHookPayload();
  if (!isTurnCompletionPayload(payload)) {
    debug(`Ignoring hook event: ${payload.hook_event_name}`);
    return 0;
  }
  const hookContext = getHookContext(payload);
  if (hookContext === null) {
    return 0;
  }

  const emitter = new TraceEmitter(config);

  try {
    // Hold turns whose task_complete has not landed yet (Stop can race the
    // rollout append); they are replayed and emitted on the next Stop.
    const emitted = await emitNewTurnsFromRollout(emitter, config, hookContext.sessionId, hookContext.transcriptPath, {
      flushIncompleteTurns: false,
    });
    const dur = (Date.now() - start) / 1000;
    info(`Processed ${emitted} turns in ${dur.toFixed(2)}s (session=${hookContext.sessionId})`);
    return 0;
  } catch (e) {
    // Fail-open: a lock timeout or any unexpected failure must never block Codex.
    debug(`Unexpected failure: ${e}`);
    return 0;
  }
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0));
