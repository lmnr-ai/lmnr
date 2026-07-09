import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { Row } from "../src/types.js";

let tsCounter = 0;
export function nextTs(baseMs = Date.parse("2026-07-09T10:00:00.000Z")): string {
  tsCounter += 1;
  return new Date(baseMs + tsCounter * 1000).toISOString();
}

export function line(type: string, payload: Row, ts?: string): Row {
  return { timestamp: ts ?? nextTs(), type, payload };
}

export function sessionMetaLine(extra: Row = {}): Row {
  return line("session_meta", {
    id: "5973b6c0-94b8-487b-a530-2aeb6098ae0e",
    timestamp: "2026-07-09T10:00:00.000Z",
    cwd: "/home/dev/project",
    originator: "codex_cli_rs",
    cli_version: "0.144.0",
    source: "cli",
    git: { branch: "main", commit_hash: "abc123" },
    ...extra,
  });
}

export function turnContextLine(model = "gpt-5.2-codex", ts?: string): Row {
  return line("turn_context", { model, cwd: "/home/dev/project", approval_policy: "on-request" }, ts);
}

export function userMessageLine(text: string, ts?: string): Row {
  return line("response_item", { type: "message", role: "user", content: [{ type: "input_text", text }] }, ts);
}

export function assistantMessageLine(text: string, ts?: string): Row {
  return line("response_item", { type: "message", role: "assistant", content: [{ type: "output_text", text }] }, ts);
}

export function reasoningLine(summary: string, ts?: string): Row {
  return line("response_item", { type: "reasoning", summary: [{ type: "summary_text", text: summary }] }, ts);
}

export function functionCallLine(name: string, args: Row | string, callId: string, ts?: string): Row {
  return line(
    "response_item",
    { type: "function_call", name, arguments: typeof args === "string" ? args : JSON.stringify(args), call_id: callId },
    ts
  );
}

export function functionCallOutputLine(callId: string, output: any, ts?: string): Row {
  return line("response_item", { type: "function_call_output", call_id: callId, output }, ts);
}

export function tokenCountLine(
  last: { input_tokens?: number; cached_input_tokens?: number; output_tokens?: number; reasoning_output_tokens?: number },
  ts?: string
): Row {
  return line("event_msg", { type: "token_count", info: { total_token_usage: last, last_token_usage: last }, rate_limits: null }, ts);
}

export function taskCompleteLine(lastAgentMessage: string | null = null, ts?: string): Row {
  return line("event_msg", { type: "task_complete", turn_id: "turn-1", last_agent_message: lastAgentMessage }, ts);
}

export function taskStartedLine(ts?: string): Row {
  return line("event_msg", { type: "task_started", turn_id: "turn-1" }, ts);
}

export function spansByName(spans: ReadableSpan[]): Record<string, ReadableSpan> {
  const out: Record<string, ReadableSpan> = {};
  for (const s of spans) {
    out[s.name] = s;
  }
  return out;
}
