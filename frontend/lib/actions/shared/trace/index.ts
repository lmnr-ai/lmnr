import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const GetSharedTraceSchema = z.object({
  traceId: z.string(),
});

export const getSharedTrace = async (input: z.infer<typeof GetSharedTraceSchema>): Promise<TraceViewTrace> => {
  const { traceId } = GetSharedTraceSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

  const [trace] = await executeQuery<Omit<TraceViewTrace, "visibility">>({
    query: `
      SELECT
        id,
        start_time as startTime,
        end_time as endTime,
        input_tokens as inputTokens,
        output_tokens as outputTokens,
        total_tokens as totalTokens,
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        metadata,
        status,
        trace_type as traceType
        has_browser_session as hasBrowserSession
      FROM traces
      WHERE id = {traceId: UUID}
      LIMIT 1
    `,
    projectId: sharedTrace.projectId,
    parameters: {
      traceId,
    },
  });

  if (!trace) {
    throw new Error("Trace not found.");
  }

  return { ...trace, visibility: "public" };
};
