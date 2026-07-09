/**
 * Claude Code -> Laminar hook
 *
 * Reads the Claude Code session transcript incrementally on Stop / SessionEnd
 * hooks, assembles conversational turns, and emits them to Laminar as
 * OpenTelemetry traces over OTLP/HTTP/JSON.
 */
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { getLaminarConfig } from "./config.js";
import { emitNewTurnsFromTranscript } from "./emit.js";
import { debug, info } from "./logger.js";
import { TraceEmitter } from "./tracer.js";
import type { Row } from "./types.js";

// ----------------- Hook payload -----------------
function readStdin(): string {
  try {
    return fs.readFileSync(0, "utf-8");
  } catch {
    // No stdin (e.g. a TTY) — tolerate it.
    return "";
  }
}

/** Claude Code hooks pass a JSON payload on stdin; tolerate missing/empty stdin. */
function readHookPayload(): Row {
  try {
    const data = readStdin();
    debug(`stdin received ${data.length} chars`);
    if (!data.trim()) {
      return {};
    }
    const parsed = JSON.parse(data);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      debug(`payload top-level keys: ${Object.keys(parsed).sort().join(", ")}`);
      return parsed;
    }
    debug(`payload is ${Array.isArray(parsed) ? "array" : typeof parsed}, expected object; exiting.`);
    return {};
  } catch (e) {
    debug(`readHookPayload exception: ${e}`);
    return {};
  }
}

function expandUser(p: string): string {
  if (p === "~" || p.startsWith("~/")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function extractSessionIdAndTranscriptPath(payload: Row): [string | null, string | null] {
  const sessionId =
    payload.sessionId ||
    payload.session_id ||
    (typeof payload.session === "object" && payload.session !== null ? payload.session.id : undefined) ||
    null;

  const transcriptPathRaw =
    payload.transcriptPath ||
    payload.transcript_path ||
    (typeof payload.transcript === "object" && payload.transcript !== null ? payload.transcript.path : undefined) ||
    null;

  let transcriptPath: string | null = null;
  if (transcriptPathRaw) {
    try {
      transcriptPath = path.resolve(expandUser(String(transcriptPathRaw)));
    } catch {
      transcriptPath = null;
    }
  }

  return [sessionId ? String(sessionId) : null, transcriptPath];
}

function getSessionIdAndTranscriptPath(payload: Row): [string, string] | null {
  const [sessionId, transcriptPath] = extractSessionIdAndTranscriptPath(payload);
  if (!sessionId || !transcriptPath) {
    // No structured payload; fail open (do not guess).
    debug("Missing session_id or transcript_path from hook payload; exiting.");
    return null;
  }
  if (!fs.existsSync(transcriptPath)) {
    debug(`Transcript path does not exist: ${transcriptPath}`);
    return null;
  }
  return [sessionId, transcriptPath];
}

function isSessionEndHookPayload(payload: Row): boolean {
  const hookEventName = payload.hook_event_name || payload.hookEventName;
  return hookEventName === "SessionEnd";
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
  const hookContext = getSessionIdAndTranscriptPath(payload);
  if (hookContext === null) {
    return 0;
  }

  const [sessionId, transcriptPath] = hookContext;
  const flushDeferredAgentTurns = isSessionEndHookPayload(payload);

  const emitter = new TraceEmitter(config);

  try {
    const emitted = await emitNewTurnsFromTranscript(emitter, config, sessionId, transcriptPath, {
      flushDeferredAgentTurns,
    });
    const dur = (Date.now() - start) / 1000;
    info(`Processed ${emitted} turns in ${dur.toFixed(2)}s (session=${sessionId})`);
    return 0;
  } catch (e) {
    // Fail-open: a lock timeout or any unexpected failure must never block CC.
    debug(`Unexpected failure: ${e}`);
    return 0;
  }
}

main()
  .then((code) => process.exit(code))
  .catch(() => process.exit(0));
