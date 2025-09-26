import { and, eq, inArray } from "drizzle-orm";
import { uniq } from "lodash";
import { z } from "zod/v4";

import { TraceViewTrace } from "@/components/traces/trace-view/trace-view-store.tsx";
import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { transformMessages } from "@/lib/actions/trace/utils";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { sharedPayloads, sharedTraces } from "@/lib/db/migrations/schema";

export const UpdateTraceVisibilitySchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
  visibility: z.enum(["public", "private"]),
});

export const GetTraceSchema = z.object({
  traceId: z.string(),
  projectId: z.string(),
});

export const GetSharedTraceSchema = z.object({
  traceId: z.string(),
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

  const parseResult = traceSpans
    .map((span) => {
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
    if (visibility === "public") {
      await tx.insert(sharedTraces).values({ id: traceId, projectId }).onConflictDoNothing();
      if (payloadIds.length > 0) {
        await tx
          .insert(sharedPayloads)
          .values(payloadIds.map((payloadId) => ({ payloadId, projectId })))
          .onConflictDoNothing();
      }
    } else {
      await tx.delete(sharedTraces).where(and(eq(sharedTraces.id, traceId), eq(sharedTraces.projectId, projectId)));
      if (payloadIds.length > 0) {
        await tx
          .delete(sharedPayloads)
          .where(and(inArray(sharedPayloads.payloadId, payloadIds), eq(sharedPayloads.projectId, projectId)));
      }
    }
  });
}

export async function getTrace(input: z.infer<typeof GetTraceSchema>): Promise<TraceViewTrace> {
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
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        metadata,
        status,
        trace_type as traceType
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
    throw new Error("Trace not found.");
  }

  return {
    ...trace,
    visibility: sharedTrace ? "public" : "private",
  };
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
        input_cost as inputCost,
        output_cost as outputCost,
        total_cost as totalCost,
        metadata,
        status,
        trace_type as traceType
      FROM traces
      WHERE id = {traceId: UUID}
      LIMIT 1
    `,
    parameters: {
      traceId,
    },
    projectId,
  });

  if (!trace) {
    throw new Error("Trace not found.");
  }

  return {
    ...trace,
    visibility: "public",
  };
}
