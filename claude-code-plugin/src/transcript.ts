import * as crypto from "node:crypto";
import * as fs from "node:fs";
import { MAX_CHARS } from "./config.js";
import { debug } from "./logger.js";
import type { SessionState } from "./state.js";
import type { Json, Row } from "./types.js";

// ----------------- Transcript row parsing -----------------
export function getContentFromRow(row: Row): Json {
  if (typeof row !== "object" || row === null) {
    return null;
  }
  const message = row.message;
  if (typeof message === "object" && message !== null) {
    return message.content;
  }
  return row.content;
}

export function getUserOrAssistantRoleFromRow(row: Row): string | null {
  // Prefer top-level row.type when it marks a chat row, then fall back to
  // nested message.role.
  const rowType = row.type;
  if (rowType === "user" || rowType === "assistant") {
    return rowType;
  }
  const message = row.message;
  if (typeof message === "object" && message !== null) {
    const role = message.role;
    if (role === "user" || role === "assistant") {
      return role;
    }
  }
  return null;
}

export function getMessageId(row: Row): string | null {
  const m = row.message;
  if (typeof m === "object" && m !== null) {
    const mid = m.id;
    if (typeof mid === "string" && mid) {
      return mid;
    }
  }
  return null;
}

export function getModel(row: Row): string {
  const m = row.message;
  if (typeof m === "object" && m !== null) {
    return m.model || "claude";
  }
  return "claude";
}

/** Extract Anthropic token usage from an assistant message, if present. */
export function getUsageDetailsFromRow(row: Row): Record<string, number> | null {
  const m = row.message;
  if (typeof m !== "object" || m === null) {
    return null;
  }
  const u = m.usage;
  if (typeof u !== "object" || u === null) {
    return null;
  }
  const details: Record<string, number> = {};
  for (const key of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
    const v = u[key];
    if (typeof v === "number" && Number.isInteger(v) && v > 0) {
      details[key] = v;
    }
  }
  return Object.keys(details).length > 0 ? details : null;
}

/** Parse a Claude Code jsonl row timestamp (ISO 8601 with trailing Z). */
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

export function extractTextFromContent(content: Json): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const x of content) {
      if (typeof x === "object" && x !== null && x.type === "text") {
        parts.push(x.text || "");
      } else if (typeof x === "string") {
        parts.push(x);
      }
    }
    return parts.filter((p) => p).join("\n");
  }
  return "";
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

function blocksOfType(content: Json, type: string): Row[] {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.filter((x): x is Row => typeof x === "object" && x !== null && x.type === type);
}

export const getToolUseBlocks = (content: Json): Row[] => blocksOfType(content, "tool_use");
export const getToolResultBlocks = (content: Json): Row[] => blocksOfType(content, "tool_result");

export function isToolResult(row: Row): boolean {
  if (getUserOrAssistantRoleFromRow(row) !== "user") {
    return false;
  }
  const content = getContentFromRow(row);
  if (Array.isArray(content)) {
    return content.some((x) => typeof x === "object" && x !== null && x.type === "tool_result");
  }
  return false;
}

// ----------------- Incremental transcript reading -----------------
/**
 * Reads only new bytes since sessionState.offset. Keeps sessionState.buffer for
 * the partial last line. Returns parsed JSON rows and the mutated state.
 */
export function readNewJsonl(transcriptPath: string, sessionState: SessionState): [Row[], SessionState] {
  if (!fs.existsSync(transcriptPath)) {
    return [[], sessionState];
  }

  let chunk: Buffer;
  let newOffset: number;
  try {
    const fileSize = fs.statSync(transcriptPath).size;
    if (fileSize < sessionState.offset) {
      // Transcript was rotated or truncated — restart from the beginning.
      debug(`transcript shrank (${fileSize} < ${sessionState.offset}); restarting`);
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
