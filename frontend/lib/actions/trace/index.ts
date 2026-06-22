import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { type TraceViewTrace } from "@/components/traces/trace-view/store";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const UpdateTraceVisibilitySchema = z.object({
  traceId: z.guid(),
  projectId: z.guid(),
  visibility: z.enum(["public", "private"]),
});

export const GetTraceSchema = z.object({
  traceId: z.guid(),
  projectId: z.guid(),
});

type TraceCacheReasoningTokens = Pick<
  TraceViewTrace,
  "cacheReadInputTokens" | "cacheCreationInputTokens" | "reasoningTokens"
>;

/**
 * Backfills the denormalized per-trace cache/reasoning token sums for traces
 * ingested before LAM-1807. Those rows default the trace-level columns to 0
 * (there is no historical backfill on `traces_replacing`), so when all three
 * are 0 we fall back to summing the per-span columns. The span columns
 * themselves carry `DEFAULT JSONExtractInt(attributes, …)`, so old spans still
 * resolve from `attributes` on read. New traces have non-zero denormalized
 * values and skip this query entirely, so steady-state cost is unchanged.
 */
export const backfillTraceCacheReasoningTokens = async <T extends TraceCacheReasoningTokens>(
  trace: T,
  projectId: string,
  traceId: string
): Promise<T> => {
  if (trace.cacheReadInputTokens || trace.cacheCreationInputTokens || trace.reasoningTokens) {
    return trace;
  }

  const [extraTokens] = await executeQuery<TraceCacheReasoningTokens>({
    query: `
      SELECT
        SUM(cache_read_input_tokens) as cacheReadInputTokens,
        SUM(cache_creation_input_tokens) as cacheCreationInputTokens,
        SUM(reasoning_tokens) as reasoningTokens
      FROM spans
      WHERE trace_id = {traceId: UUID}
    `,
    projectId,
    parameters: {
      traceId,
    },
  });

  return {
    ...trace,
    cacheReadInputTokens: extraTokens?.cacheReadInputTokens ?? 0,
    cacheCreationInputTokens: extraTokens?.cacheCreationInputTokens ?? 0,
    reasoningTokens: extraTokens?.reasoningTokens ?? 0,
  };
};

export async function updateTraceVisibility(params: z.infer<typeof UpdateTraceVisibilitySchema>) {
  const { traceId, projectId, visibility } = UpdateTraceVisibilitySchema.parse(params);

  if (visibility === "public") {
    await db.insert(sharedTraces).values({ id: traceId, projectId }).onConflictDoNothing();
  } else {
    await db.delete(sharedTraces).where(and(eq(sharedTraces.id, traceId), eq(sharedTraces.projectId, projectId)));
  }
}

export async function getTrace(input: z.infer<typeof GetTraceSchema>): Promise<TraceViewTrace | undefined> {
  const { traceId, projectId } = GetTraceSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: and(eq(sharedTraces.projectId, projectId), eq(sharedTraces.id, traceId)),
  });

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
        has_browser_session as hasBrowserSession,
        session_id as sessionId,
        user_id as userId
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

  const backfilledTrace = await backfillTraceCacheReasoningTokens(trace, projectId, traceId);

  return {
    ...backfilledTrace,
    visibility: sharedTrace ? "public" : "private",
  };
}

export async function isTracePublic(traceId: string): Promise<boolean> {
  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  return !!sharedTrace;
}
