import type { ReadableSpan } from "@opentelemetry/sdk-trace-base";
import type { Row } from "../src/types.js";

export function userRow(text: any, ts = "2026-07-08T10:00:00.000Z", extra: Row = {}): Row {
  return {
    type: "user",
    message: { role: "user", content: text },
    timestamp: ts,
    ...extra,
  };
}

export function assistantRow(
  content: any,
  {
    msgId = "msg_1",
    ts = "2026-07-08T10:00:05.000Z",
    model = "claude-opus-4-7",
  }: { msgId?: string; ts?: string; model?: string } = {}
): Row {
  return {
    type: "assistant",
    message: {
      id: msgId,
      role: "assistant",
      model,
      content,
      usage: { input_tokens: 10, output_tokens: 5 },
    },
    timestamp: ts,
  };
}

export function toolResultRow(toolUseId: string, content: any, ts = "2026-07-08T10:00:10.000Z", extra: Row = {}): Row {
  return {
    type: "user",
    message: {
      role: "user",
      content: [{ type: "tool_result", tool_use_id: toolUseId, content }],
    },
    timestamp: ts,
    ...extra,
  };
}

export function spansByName(spans: ReadableSpan[]): Record<string, ReadableSpan> {
  const out: Record<string, ReadableSpan> = {};
  for (const s of spans) {
    out[s.name] = s;
  }
  return out;
}
