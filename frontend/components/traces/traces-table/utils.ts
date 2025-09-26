import { RealtimeTracePayload, TraceRow } from "@/lib/traces/types.ts";

export const mapPendingTraceFromRealTime = (row: RealtimeTracePayload): TraceRow => ({
  id: row.id,
  inputTokens: row.input_token_count,
  outputTokens: row.output_token_count,
  totalTokens: row.total_token_count,
  inputCost: row.input_cost,
  outputCost: row.output_cost,
  totalCost: row.cost,
  metadata: row.metadata || {},
  traceType: row.trace_type,
  status: row.status || "",
  startTime: row.start_time || "",
  endTime: row.end_time || "",
  tags: [],
  ...(row.session_id && { sessionId: row.session_id }),
  ...(row.top_span_id && { topSpanId: row.top_span_id }),
  ...(row.user_id && { userId: row.user_id }),
});
