import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { createDatapoints } from "@/lib/actions/datapoints";
import { pushQueueItems } from "@/lib/actions/queue";
import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { downloadSpanImages } from "@/lib/spans/utils";
import { Span } from "@/lib/traces/types.ts";

export const GetSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(),
});

export const UpdateSpanOutputSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
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
      start_time as startTime,
      end_time as endTime,
      trace_id as traceId,
      status,
      input,
      output,
      path,
      attributes
    FROM spans
    WHERE ${whereConditions.join(" AND ")}
    LIMIT 1
  `;

  const [span] = await executeQuery<Omit<Span, "attributes"> & { attributes: string }>({
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
  };
}

export async function updateSpanOutput(input: z.infer<typeof UpdateSpanOutputSchema>) {
  const { spanId, projectId, output } = UpdateSpanOutputSchema.parse(input);

  await clickhouseClient
    .command({
      query: `
      ALTER TABLE spans
      UPDATE output = {output: String}
      WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID}
    `,
      query_params: {
        output: JSON.stringify(output),
        spanId,
        projectId,
      },
    })
    .catch((error) => {
      console.error("Error updating span output in ClickHouse", error);
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
