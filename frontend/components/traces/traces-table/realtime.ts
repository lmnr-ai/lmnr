import { type RealtimeTracePayload, type SpanType, type TraceRow } from "@/lib/traces/types";

// Map a `trace_update` SSE payload onto the table's row shape. Realtime rows
// replace fetched rows wholesale, so every column the table renders must be
// carried over here.
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
  // Agent input is extracted asynchronously and lives in traces_agg, which the
  // realtime SSE payload doesn't carry. Use the payload's root-span input as a
  // transient live stand-in; the true agent_input replaces it on the next full
  // fetch of the row.
  agentInput: trace.rootSpanInput ?? undefined,
});
