import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { createDatapoints } from "@/lib/actions/datapoints";
import { pushQueueItems } from "@/lib/actions/queue";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { downloadSpanImages } from "@/lib/spans/utils";
import { type Span } from "@/lib/traces/types.ts";

export const GetSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(),
});

export const UpdateSpanOutputSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string(),
  output: z.any(),
});

export const ExportSpanSchema = z.object({
  spanId: z.string(),
  datasetId: z.string(),
  projectId: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const PushSpanSchema = z.object({
  metadata: z.object({
    source: z.enum(["span", "datapoint"]),
    datasetId: z.string().optional(),
    traceId: z.string().optional(),
    id: z.string(),
  }),
  spanId: z.string(),
  projectId: z.string(),
  queueId: z.string(),
});

export async function getSpan(input: z.infer<typeof GetSpanSchema>) {
  const { spanId, traceId, projectId } = GetSpanSchema.parse(input);

  const whereConditions = [`span_id = {spanId: UUID}`];
  const parameters: Record<string, any> = { spanId };

  if (traceId) {
    whereConditions.push(`trace_id = {traceId: UUID}`);
    parameters.traceId = traceId;
  }

  const mainQuery = `
    SELECT
      span_id as spanId,
      parent_span_id as parentSpanId,
      name,
      span_type as spanType,
      input_tokens as inputTokens,
      output_tokens as outputTokens,
      total_tokens as totalTokens,
      input_cost as inputCost,
      output_cost as outputCost,
      total_cost as totalCost,
      formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
      formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
      trace_id as traceId,
      status,
      input,
      output,
      path,
      attributes,
      events
    FROM spans
    WHERE ${whereConditions.join(" AND ")}
    LIMIT 1
  `;

  // Events are stored as Array(Tuple(timestamp Int64, name String, attributes String)) on the
  // spans table. ClickHouse JSON format serializes named tuples as objects and Int64 as unquoted
  // numbers (output_format_json_quote_64bit_integers = 0), so each event arrives as
  // { timestamp: number, name: string, attributes: string }.

  // Retry with exponential backoff up to 2 seconds to handle transient ClickHouse errors.
  const MAX_ELAPSED_MS = 2000;
  const INITIAL_DELAY_MS = 100;
  let lastError: unknown;
  let elapsed = 0;
  let delay = INITIAL_DELAY_MS;

  while (elapsed < MAX_ELAPSED_MS) {
    try {
      const [span] = await executeQuery<
        Omit<Span, "attributes" | "events"> & {
          attributes: string;
          events: { timestamp: number; name: string; attributes: string }[];
        }
      >({
        query: mainQuery,
        parameters,
        projectId,
      });

      if (!span) {
        throw new Error("Span not found");
      }

      return {
        ...span,
        input: tryParseJson(span.input),
        output: tryParseJson(span.output),
        attributes: tryParseJson(span.attributes) || {},
        events: (span.events || []).map((event) => ({
          timestamp: event.timestamp,
          name: event.name,
          attributes: tryParseJson(event.attributes) || {},
        })),
      };
    } catch (e) {
      lastError = e;
      const sleepTime = Math.min(delay, MAX_ELAPSED_MS - elapsed);
      if (sleepTime <= 0) break;
      await new Promise((resolve) => setTimeout(resolve, sleepTime));
      elapsed += sleepTime;
      delay *= 2;
    }
  }

  throw lastError;
}

export async function updateSpanOutput(input: z.infer<typeof UpdateSpanOutputSchema>) {
  const { spanId, projectId, traceId, output } = UpdateSpanOutputSchema.parse(input);

  await clickhouseClient.command({
    query: `
      ALTER TABLE spans
      UPDATE output = {output: String}
      WHERE project_id = {projectId: UUID} AND trace_id = {traceId: UUID} AND span_id = {spanId: UUID}
    `,
    query_params: {
      output: JSON.stringify(output),
      spanId,
      projectId,
      traceId,
    },
  });
}

export async function exportSpanToDataset(input: z.infer<typeof ExportSpanSchema>) {
  const { spanId, projectId, datasetId, metadata = {} } = ExportSpanSchema.parse(input);

  const span = await getSpan({ spanId, projectId });
  const processedInput = await downloadSpanImages(span.input);

  await createDatapoints({
    projectId,
    datasetId,
    datapoints: [
      {
        data: processedInput || {},
        target: span.output || {},
        metadata: metadata,
      },
    ],
    sourceSpanId: spanId,
  });
}

export async function pushSpanToLabelingQueue(input: z.infer<typeof PushSpanSchema>) {
  const { queueId, spanId, metadata, projectId } = PushSpanSchema.parse(input);

  const span = await getSpan({ spanId, projectId });
  const processedInput = await downloadSpanImages(span.input);

  await pushQueueItems({
    queueId,
    items: [
      {
        metadata,
        payload: {
          data: processedInput,
          target: span.output,
          metadata: {},
        },
      },
    ],
  });
}
