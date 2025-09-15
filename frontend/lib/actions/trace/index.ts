import { and, eq, inArray } from "drizzle-orm";
import { uniq } from "lodash";
import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { transformMessages } from "@/lib/actions/trace/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { sharedPayloads, traces } from "@/lib/db/migrations/schema";

export const UpdateTraceVisibilitySchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
  visibility: z.enum(["public", "private"]),
});

interface ClickHouseSpan {
  span_id: string;
  name: string;
  span_type: number;
  start_time: string;
  end_time: string;
  input_cost: number;
  output_cost: number;
  total_cost: number;
  model: string;
  session_id: string;
  project_id: string;
  trace_id: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  user_id: string;
  path: string;
  input: string;
  output: string;
  input_lower: string;
  output_lower: string;
  size_bytes: number;
  status: string;
  attributes: string;
  request_model: string;
  response_model: string;
  parent_span_id: string;
  trace_metadata: string;
  trace_type: number;
}

export async function updateTraceVisibility(params: z.infer<typeof UpdateTraceVisibilitySchema>) {
  const { traceId, projectId, visibility } = UpdateTraceVisibilitySchema.parse(params);

  const chResult = await clickhouseClient.query({
    query: `
      SELECT *
      FROM spans
      WHERE trace_id = {traceId: UUID} 
        AND project_id = {projectId: UUID}
        AND (
          span_type = {llmSpanType: UInt8}
        )
    `,
    format: "JSONEachRow",
    query_params: {
      traceId,
      projectId,
      llmSpanType: 1,
    },
  });

  const traceSpans = (await chResult.json()) as ClickHouseSpan[];

  /**
   * 1. Parse span image url's, and extract payload id's
   */

  const parseResult = traceSpans.map((span) => {
    const inputData = tryParseJson(span.input);
    const outputData = tryParseJson(span.output);

    const input = transformMessages(inputData, projectId, visibility);
    const output = transformMessages(outputData, projectId, visibility);

    return {
      id: span.span_id,
      input: input.messages,
      output: output.messages,
      payloadIds: uniq([...Array.from(input.payloads), ...Array.from(output.payloads)]),
      existingSpan: span,
    };
  })
    .filter((p) => p.payloadIds.length > 0);

  const payloadIds = parseResult.flatMap((p) => p.payloadIds);

  /**
   * 2. Update spans in ClickHouse using delete and insert pattern (outside transaction)
   */
  if (parseResult.length > 0) {
    const spanIds = parseResult.map((item) => item.id);

    await clickhouseClient.command({
      query: `
        DELETE FROM spans
        WHERE span_id IN ({spanIds: Array(UUID)}) 
          AND trace_id = {traceId: UUID}
          AND project_id = {projectId: UUID}
      `,
      query_params: {
        spanIds,
        traceId,
        projectId,
      },
    });

    const updatedSpans: ClickHouseSpan[] = parseResult.map((item) => ({
      ...item.existingSpan,
      input: JSON.stringify(item.input),
      output: JSON.stringify(item.output),
    }));

    await clickhouseClient.insert({
      table: "spans",
      values: updatedSpans,
      format: "JSONEachRow",
      clickhouse_settings: {
        wait_for_async_insert: 1,
        async_insert: 1,
      },
    });
  }

  /**
   * 3. Perform PostgreSQL transaction for traces and shared payloads
   */
  return await db.transaction(async (tx) => {
    await tx
      .update(traces)
      .set({ visibility })
      .where(and(eq(traces.id, traceId), eq(traces.projectId, projectId)));

    if (payloadIds.length > 0) {
      if (visibility === "public") {
        await tx
          .insert(sharedPayloads)
          .values(payloadIds.map((payloadId) => ({ payloadId, projectId })))
          .onConflictDoNothing();
      } else {
        await tx
          .delete(sharedPayloads)
          .where(and(inArray(sharedPayloads.payloadId, payloadIds), eq(sharedPayloads.projectId, projectId)));
      }
    }
  });
}
