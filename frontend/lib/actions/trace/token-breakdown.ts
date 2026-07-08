import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import {
  estimateSpanTokenBuckets,
  TOKEN_BUCKET_KEYS,
  type TokenBuckets,
  type TraceTokenBreakdownResponse,
} from "@/lib/spans/token-breakdown";
import { resolveTools } from "@/lib/spans/tools";

export const GetTraceTokenBreakdownSchema = z.object({
  traceId: z.guid(),
  projectId: z.guid(),
});

interface TokenBreakdownSpanRow {
  input: string;
  toolDefinitions: string;
  toolAttributes: string;
  inputTokens: number;
}

/**
 * Estimate how the trace's total input tokens split across system prompt,
 * tool definitions, user messages, and history. Runs the SAME per-span
 * estimator + tool resolver the span tooltip uses, server-side over every LLM
 * span of the trace (payload bytes never leave the server), and sums the
 * buckets — so the trace breakdown is exactly the sum of the per-span
 * breakdowns.
 */
export async function getTraceTokenBreakdown(
  input: z.infer<typeof GetTraceTokenBreakdownSchema>
): Promise<TraceTokenBreakdownResponse> {
  const { traceId, projectId } = GetTraceTokenBreakdownSchema.parse(input);

  const spans = await executeQuery<TokenBreakdownSpanRow>({
    query: `
      SELECT
        input,
        tool_definitions as toolDefinitions,
        if(tool_definitions = '', attributes, '') as toolAttributes,
        input_tokens as inputTokens
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type IN ('LLM', 'CACHED')
        AND input_tokens > 0
    `,
    projectId,
    parameters: { traceId },
  });

  const buckets: TokenBuckets = { system: 0, tools: 0, user: 0, history: 0 };
  let estimatedInputTokens = 0;

  for (const span of spans) {
    const spanBuckets = estimateSpanTokenBuckets(
      tryParseJson(span.input),
      // Mirror the span tooltip's resolveTools: prefer the dedup'd column,
      // fall back to legacy attributes (only shipped for pre-dedup spans).
      resolveTools({ toolDefinitions: span.toolDefinitions, attributes: tryParseJson(span.toolAttributes) ?? {} }),
      span.inputTokens
    );
    if (!spanBuckets) continue;
    for (const key of TOKEN_BUCKET_KEYS) {
      buckets[key] += spanBuckets[key];
    }
    estimatedInputTokens += span.inputTokens;
  }

  return { buckets, estimatedInputTokens };
}
