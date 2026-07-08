import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import {
  estimateSpanTokenBuckets,
  TOKEN_BUCKET_KEYS,
  type TokenBuckets,
  type TraceTokenBreakdownResponse,
} from "@/lib/spans/token-breakdown";
import { extractToolsFromColumn } from "@/lib/spans/tools";

export const GetTraceTokenBreakdownSchema = z.object({
  traceId: z.guid(),
  projectId: z.guid(),
});

// Caps the CH→server payload transfer for pathological traces. Spans are taken
// in descending input_tokens order, so the cap trims the least significant
// contributors first; the response flags `truncated` so the UI can say "~".
const MAX_SPANS = 512;

/**
 * Estimate how the trace's total input tokens split across system prompt,
 * tool definitions, user messages, and history. Runs the SAME per-span
 * estimator the span tooltip uses, server-side over every LLM span of the
 * trace (payload bytes never leave the server), and sums the buckets — so the
 * trace breakdown is exactly the sum of the per-span breakdowns.
 */
export async function getTraceTokenBreakdown(
  input: z.infer<typeof GetTraceTokenBreakdownSchema>
): Promise<TraceTokenBreakdownResponse> {
  const { traceId, projectId } = GetTraceTokenBreakdownSchema.parse(input);

  const spans = await executeQuery<{ input: string; toolDefinitions: string; inputTokens: number }>({
    query: `
      SELECT
        input,
        tool_definitions as toolDefinitions,
        input_tokens as inputTokens
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type IN ('LLM', 'CACHED')
        AND input_tokens > 0
      ORDER BY input_tokens DESC
      LIMIT ${MAX_SPANS + 1}
    `,
    projectId,
    parameters: { traceId },
  });

  const truncated = spans.length > MAX_SPANS;

  const buckets: TokenBuckets = { system: 0, tools: 0, user: 0, history: 0 };
  let estimatedInputTokens = 0;

  for (const span of spans.slice(0, MAX_SPANS)) {
    const spanBuckets = estimateSpanTokenBuckets(
      tryParseJson(span.input),
      extractToolsFromColumn(span.toolDefinitions),
      span.inputTokens
    );
    if (!spanBuckets) continue;
    for (const key of TOKEN_BUCKET_KEYS) {
      buckets[key] += spanBuckets[key];
    }
    estimatedInputTokens += span.inputTokens;
  }

  return { buckets, estimatedInputTokens, truncated };
}
