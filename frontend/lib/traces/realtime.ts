import { type RealtimeTracePayload, type SpanType, type TraceRow } from "@/lib/traces/types";

// Shared by every `trace_update` consumer (traces table, debugger session view):
// the SSE payload is a per-batch DELTA, so a row is seeded once and then
// accumulated. Lives here rather than under one consumer's folder because the
// wire contract is owned by `RealtimeTracePayload`, not by any single table.

// Seed a not-yet-seen trace; the next fetch reconciles.
export const realtimeTraceToRow = (trace: RealtimeTracePayload): TraceRow => ({
  id: trace.id,
  startTime: trace.startTime ?? "",
  endTime: trace.endTime ?? "",
  sessionId: trace.sessionId ?? undefined,
  metadata: trace.metadata ?? {},
  inputTokens: trace.inputTokens,
  outputTokens: trace.outputTokens,
  totalTokens: trace.totalTokens,
  cacheReadInputTokens: trace.cacheReadInputTokens,
  cacheCreationInputTokens: trace.cacheCreationInputTokens,
  reasoningTokens: trace.reasoningTokens,
  inputCost: trace.inputCost,
  outputCost: trace.outputCost,
  totalCost: trace.totalCost,
  traceType: trace.traceType,
  topSpanId: trace.topSpanId ?? undefined,
  topSpanName: trace.topSpanName ?? undefined,
  topSpanType: (trace.topSpanType as SpanType) ?? undefined,
  status: trace.status ?? "",
  userId: trace.userId ?? undefined,
  spanTags: trace.tags ?? [],
  traceTags: [],
  // Real agent_input rides its own `trace_agent_input_update` event.
  agentInput: undefined,
});

const minTime = (a: string | undefined, b: string | null): string | undefined => {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return Date.parse(b) < Date.parse(a) ? b : a;
};

const maxTime = (a: string | undefined, b: string | null): string | undefined => {
  if (!a) return b ?? undefined;
  if (!b) return a;
  return Date.parse(b) > Date.parse(a) ? b : a;
};

// Accumulate a per-batch delta onto a row. Preserves fetched
// traceTags/snippets/agentInput (the delta never carries them).
export const mergeTraceDelta = (existing: TraceRow, delta: RealtimeTracePayload): TraceRow => ({
  ...existing,
  startTime: minTime(existing.startTime || undefined, delta.startTime) ?? existing.startTime,
  endTime: maxTime(existing.endTime || undefined, delta.endTime) ?? existing.endTime,
  inputTokens: (existing.inputTokens ?? 0) + delta.inputTokens,
  outputTokens: (existing.outputTokens ?? 0) + delta.outputTokens,
  totalTokens: (existing.totalTokens ?? 0) + delta.totalTokens,
  cacheReadInputTokens: (existing.cacheReadInputTokens ?? 0) + delta.cacheReadInputTokens,
  cacheCreationInputTokens: (existing.cacheCreationInputTokens ?? 0) + delta.cacheCreationInputTokens,
  reasoningTokens: (existing.reasoningTokens ?? 0) + delta.reasoningTokens,
  inputCost: (existing.inputCost ?? 0) + delta.inputCost,
  outputCost: (existing.outputCost ?? 0) + delta.outputCost,
  totalCost: (existing.totalCost ?? 0) + delta.totalCost,
  // Error-wins, matching the view's `has(statuses, 'error')`.
  status: existing.status === "error" || delta.status === "error" ? "error" : delta.status || existing.status,
  metadata: { ...existing.metadata, ...(delta.metadata ?? {}) },
  // Top-span fields land only on the batch carrying the root span.
  topSpanId: delta.topSpanId ?? existing.topSpanId,
  topSpanName: delta.topSpanName ?? existing.topSpanName,
  topSpanType: (delta.topSpanType as SpanType) ?? existing.topSpanType,
  traceType: delta.traceType ?? existing.traceType,
  sessionId: delta.sessionId ?? existing.sessionId,
  userId: delta.userId ?? existing.userId,
  spanTags: Array.from(new Set([...(existing.spanTags ?? []), ...(delta.tags ?? [])])),
});

// A trace fragment that can arrive out of order (before the row's trace_update
// seeds it). Buffered by traceId and merged in when the row appears. Only
// agentInput today; add fields here as more out-of-order events land.
export type TracePartial = {
  agentInput?: unknown;
};

const applyAgentInput = (existing: TraceRow, agentInput: unknown): TraceRow => ({
  ...existing,
  agentInput: typeof agentInput === "string" ? agentInput : JSON.stringify(agentInput),
});

// Merge a fragment onto a row. Pure; safe to call on seed or on an existing row.
export const applyTracePartial = (existing: TraceRow, partial: TracePartial): TraceRow => {
  let row = existing;
  if (partial.agentInput !== undefined) {
    row = applyAgentInput(row, partial.agentInput);
  }
  return row;
};
