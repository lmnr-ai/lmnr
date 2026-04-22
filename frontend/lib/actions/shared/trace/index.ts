import { eq } from "drizzle-orm";
import { cache } from "react";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const GetSharedTraceSchema = z.object({
  traceId: z.guid(),
});

// Per-request cache so callers doing the redirect check don't trigger a second
// Postgres query when getSharedTrace runs for the same traceId in the same
// request. React's `cache()` is scoped to a single render pass.
export const getSharedTraceRecord = cache((traceId: string) =>
  db.query.sharedTraces.findFirst({ where: eq(sharedTraces.id, traceId) })
);

export async function getSharedTrace(input: z.infer<typeof GetSharedTraceSchema>): Promise<TraceViewTrace | undefined> {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const sharedTrace = await getSharedTraceRecord(traceId);

  if (!sharedTrace) {
    return undefined;
  }

  const projectId = sharedTrace.projectId;

  const [[trace], [extraTokens]] = await Promise.all([
    executeQuery<Omit<TraceViewTrace, "visibility">>({
      query: `
      SELECT
        id,
        formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
        formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
        input_tokens as inputTokens,
        output_tokens as outputTokens,
        total_tokens as totalTokens,
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        metadata,
        status,
        trace_type as traceType,
        has_browser_session as hasBrowserSession,
        user_id as userId
      FROM traces
      WHERE id = {traceId: UUID}
      LIMIT 1
    `,
      projectId,
      parameters: {
        traceId,
      },
    }),
    executeQuery<{ cacheReadInputTokens: number; reasoningTokens: number }>({
      query: `
      SELECT
          SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.cache_read_input_tokens')) as cacheReadInputTokens,
          SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.reasoning_tokens')) as reasoningTokens
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
      `,
      projectId,
      parameters: {
        traceId,
      },
    }),
  ]);

  if (!trace) {
    return undefined;
  }

  return {
    ...trace,
    cacheReadInputTokens: extraTokens?.cacheReadInputTokens ?? 0,
    reasoningTokens: extraTokens?.reasoningTokens ?? 0,
    visibility: "public",
  };
}
