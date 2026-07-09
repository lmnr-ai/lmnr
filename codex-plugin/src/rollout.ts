import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { codexHome, MAX_CHARS } from "./config.js";
import { debug } from "./logger.js";
import type { SessionState } from "./state.js";
import type { Json, Row } from "./types.js";

// ----------------- Rollout line helpers -----------------
// Every rollout line is {"timestamp": "...", "type": "<kind>", "payload": {...}}.
export function getLineType(row: Row): string | null {
  const t = row.type;
  return typeof t === "string" ? t : null;
}

export function getPayload(row: Row): Row {
  const p = row.payload;
  return typeof p === "object" && p !== null && !Array.isArray(p) ? p : {};
}

/** Parse the envelope timestamp (RFC3339 UTC). */
export function parseTimestamp(value: Json): Date | null {
  if (typeof value === "object" && value !== null) {
    value = value.timestamp;
  }
  if (typeof value !== "string" || !value) {
    return null;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Join the text of a Codex message content array (input_text / output_text / text items). */
export function extractTextFromContent(content: Json): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "object" && item !== null && typeof item.text === "string") {
        parts.push(item.text);
      } else if (typeof item === "string") {
        parts.push(item);
      }
    }
    return parts.filter((p) => p).join("\n");
  }
  return "";
}

// Codex injects context wrapped in pseudo-XML tags as role=user messages;
// these are not real prompts and must not start turns.
const INJECTED_USER_PREFIXES = ["<environment_context>", "<user_instructions>", "<ENVIRONMENT_CONTEXT>", "<USER_INSTRUCTIONS>"];

export function isInjectedUserText(text: string): boolean {
  const trimmed = text.trimStart();
  return INJECTED_USER_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

export interface TruncMeta {
  truncated: boolean;
  orig_len: number;
  kept_len?: number;
  sha256?: string;
}

export function truncateText(s: string | null | undefined, maxChars: number = MAX_CHARS): [string, TruncMeta] {
  if (s === null || s === undefined) {
    return ["", { truncated: false, orig_len: 0 }];
  }
  const origLen = s.length;
  if (origLen <= maxChars) {
    return [s, { truncated: false, orig_len: origLen }];
  }
  const head = s.slice(0, maxChars);
  return [
    head,
    {
      truncated: true,
      orig_len: origLen,
      kept_len: head.length,
      sha256: crypto.createHash("sha256").update(s, "utf-8").digest("hex"),
    },
  ];
}

// ----------------- Legacy notify: thread-id -> rollout path -----------------
/**
 * Find the rollout file for a thread id by scanning
 * <codex home>/sessions/YYYY/MM/DD/rollout-*-<threadId>.jsonl (newest first).
 * Used only for the legacy `notify` payload, which carries no transcript path.
 */
export function findRolloutPathForThread(threadId: string): string | null {
  const sessionsDir = path.join(codexHome(), "sessions");
  const suffix = `-${threadId}.jsonl`;
  let newest: { path: string; mtime: number } | null = null;
  const walk = (dir: string, depth: number): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // sessions/YYYY/MM/DD is 3 levels deep; don't recurse unboundedly.
        if (depth < 3) {
          walk(full, depth + 1);
        }
      } else if (entry.isFile() && entry.name.startsWith("rollout-") && entry.name.endsWith(suffix)) {
        try {
          const mtime = fs.statSync(full).mtimeMs;
          if (newest === null || mtime > newest.mtime) {
            newest = { path: full, mtime };
          }
        } catch {
          // Skip unreadable files.
        }
      }
    }
  };
  walk(sessionsDir, 0);
  return newest === null ? null : (newest as { path: string }).path;
}

// ----------------- Incremental rollout reading -----------------
/**
 * If the buffered partial line is actually a complete JSON row (rollout ended
 * without a trailing newline), parse and return it. A genuinely partial line
 * always fails JSON.parse and stays buffered.
 */
function flushBufferedRow(sessionState: SessionState): Row[] {
  const line = sessionState.buffer.trim();
  if (!line) {
    sessionState.buffer = "";
    return [];
  }
  try {
    const row = JSON.parse(line);
    sessionState.buffer = "";
    debug("flushed complete unterminated final rollout line");
    return [row];
  } catch {
    return [];
  }
}

/**
 * Reads only new bytes since sessionState.offset. Keeps sessionState.buffer for
 * the partial last line. Returns parsed JSON rows and the mutated state.
 * With flushBuffer, a buffered final line that parses as complete JSON is
 * returned instead of being held.
 */
export function readNewJsonl(
  transcriptPath: string,
  sessionState: SessionState,
  flushBuffer = false
): [Row[], SessionState] {
  const [msgs, state] = readNewJsonlIncremental(transcriptPath, sessionState);
  if (flushBuffer) {
    msgs.push(...flushBufferedRow(state));
  }
  return [msgs, state];
}

function readNewJsonlIncremental(transcriptPath: string, sessionState: SessionState): [Row[], SessionState] {
  if (!fs.existsSync(transcriptPath)) {
    return [[], sessionState];
  }

  let chunk: Buffer;
  let newOffset: number;
  try {
    const fileSize = fs.statSync(transcriptPath).size;
    if (fileSize < sessionState.offset) {
      // Rollout was rotated or truncated — restart from the beginning.
      debug(`rollout shrank (${fileSize} < ${sessionState.offset}); restarting`);
      sessionState.offset = 0;
      sessionState.buffer = "";
    }
    const fd = fs.openSync(transcriptPath, "r");
    try {
      const len = Math.max(0, fileSize - sessionState.offset);
      chunk = Buffer.alloc(len);
      if (len > 0) {
        fs.readSync(fd, chunk, 0, len, sessionState.offset);
      }
      newOffset = fileSize;
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    debug(`readNewJsonl failed: ${e}`);
    return [[], sessionState];
  }

  if (chunk.length === 0) {
    return [[], sessionState];
  }

  const text = chunk.toString("utf-8");
  const combined = sessionState.buffer + text;
  const lines = combined.split("\n");
  // The last element may be an incomplete line.
  sessionState.buffer = lines[lines.length - 1] ?? "";
  sessionState.offset = newOffset;

  const msgs: Row[] = [];
  for (const rawLine of lines.slice(0, -1)) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }
    try {
      msgs.push(JSON.parse(line));
    } catch {
      continue;
    }
  }
  return [msgs, sessionState];
}
