import { eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const GetSharedTraceSchema = z.object({
  traceId: z.guid(),
});

/**
 * Which of `traceIds` are publicly shared. One query for the whole set — blog
 * posts can reference a dozen traces and a per-link lookup would be a waterfall.
 * Non-UUID ids are dropped before the query; Postgres errors on a malformed
 * uuid comparison rather than returning no rows.
 */
export async function getPublicTraceIds(traceIds: string[]): Promise<Set<string>> {
  const valid = traceIds.filter((id) => z.guid().safeParse(id).success);
  if (valid.length === 0) return new Set();

  const rows = await db.query.sharedTraces.findMany({
    where: inArray(sharedTraces.id, valid),
    columns: { id: true },
  });

  return new Set(rows.map((row) => row.id));
}

export async function getSharedTrace(input: z.infer<typeof GetSharedTraceSchema>): Promise<TraceViewTrace | undefined> {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    return undefined;
  }

  const projectId = sharedTrace.projectId;

  const [trace] = await executeQuery<Omit<TraceViewTrace, "visibility">>({
    query: `
        SELECT
          id,
          formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
          formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
          input_tokens as inputTokens,
          output_tokens as outputTokens,
          total_tokens as totalTokens,
          cache_read_input_tokens as cacheReadInputTokens,
          cache_creation_input_tokens as cacheCreationInputTokens,
          reasoning_tokens as reasoningTokens,
          input_cost as inputCost,
          output_cost as outputCost,
          total_cost as totalCost,
          metadata,
          status,
          trace_type as traceType,
          top_span_name as topSpanName,
          top_span_type as topSpanType,
          has_browser_session as hasBrowserSession,
          user_id as userId,
          agent_input as agentInput
        FROM traces
        WHERE id = {traceId: UUID}
        LIMIT 1
      `,
    projectId,
    parameters: {
      traceId,
    },
  });

  if (!trace) {
    return undefined;
  }

  return {
    ...trace,
    visibility: "public",
  };
}
