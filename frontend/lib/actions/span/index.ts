import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { createDatapoints } from "@/lib/actions/datapoints";
import { pushQueueItems } from "@/lib/actions/queue";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";
import { Event } from "@/lib/events/types";
import { downloadSpanImages } from "@/lib/spans/utils";

export const GetSpanSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
});

export const GetSpanWithTraceIdSchema = z.object({
  spanId: z.string(),
  traceId: z.string(),
  projectId: z.string(),
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
  const { spanId, projectId } = GetSpanSchema.parse(input);

  const [dbSpan, chResult] = await Promise.all([
    db.query.spans.findFirst({
      where: and(eq(spans.spanId, spanId), eq(spans.projectId, projectId)),
      columns: {
        spanId: true,
        createdAt: true,
        parentSpanId: true,
        name: true,
        spanType: true,
        startTime: true,
        endTime: true,
        traceId: true,
        projectId: true,
        inputUrl: true,
        outputUrl: true,
        status: true,
      },
    }),
    clickhouseClient.query({
      query: `
        SELECT input, output, attributes
        FROM spans
        WHERE span_id = {spanId: UUID} AND project_id = {projectId: UUID}
        LIMIT 1
      `,
      format: "JSONEachRow",
      query_params: { spanId, projectId },
    }),
  ]);

  if (!dbSpan) {
    throw new Error("Span not found");
  }

  const chData = (await chResult.json()) as [{ input: string; output: string; attributes: string }];
  const { input: spanInput, output: spanOutput, attributes: spanAttributes } = chData[0] || {};

  return {
    ...dbSpan,
    input: tryParseJson(spanInput),
    output: tryParseJson(spanOutput),
    attributes: tryParseJson(spanAttributes) ?? {},
  };
}

export async function getSpanWithTraceId(input: z.infer<typeof GetSpanWithTraceIdSchema>) {
  const { spanId, traceId, projectId } = GetSpanWithTraceIdSchema.parse(input);

  const chResult = await clickhouseClient.query({
    query: `
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
      FROM spans_v0(project_id={projectId: UUID})
      WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID}
      LIMIT 1
    `,
    format: "JSONEachRow",
    query_params: { spanId, traceId, projectId },
  });

  const chData = (await chResult.json()) as [
    {
      spanId: string;
      parentSpanId: string;
      name: string;
      spanType: string;
      startTime: string;
      endTime: string;
      traceId: string;
      projectId: string;
      status: string;
      input: string;
      output: string;
      path: string;
      attributes: string;
    },
  ];

  if (!chData[0]) {
    throw new Error("Span not found");
  }

  const span = chData[0];

  return {
    ...span,
    inputUrl: null,
    outputUrl: null,
    input: tryParseJson(span.input),
    output: tryParseJson(span.output),
    attributes: tryParseJson(span.attributes) ?? {},
  };
}

export async function getSpanEventsWithTraceId(input: z.infer<typeof GetSpanWithTraceIdSchema>): Promise<Event[]> {
  const { spanId, traceId, projectId } = GetSpanWithTraceIdSchema.parse(input);
  const chResult = await clickhouseClient.query({
    query: `
      SELECT id, timestamp, name, attributes, span_id spanId, project_id projectId
      FROM events
      WHERE span_id = {spanId: UUID} AND trace_id = {traceId: UUID} AND project_id = {projectId: UUID}
      ORDER BY timestamp ASC
    `,
    format: "JSONEachRow",
    query_params: { spanId, traceId, projectId },
  });

  const chEvents = (await chResult.json()) as Array<{
    id: string;
    timestamp: string;
    name: string;
    attributes: string;
    spanId: string;
    projectId: string;
  }>;

  return chEvents.map((event) => ({
    ...event,
    timestamp: new Date(`${event.timestamp}Z`).toISOString(),
    attributes: tryParseJson(event.attributes),
  }));
}

export async function updateSpanOutput(input: z.infer<typeof UpdateSpanOutputSchema>) {
  const { spanId, projectId, output } = UpdateSpanOutputSchema.parse(input);

  const [updatedSpan] = await db
    .update(spans)
    .set({
      output,
    })
    .where(and(eq(spans.spanId, spanId), eq(spans.projectId, projectId)))
    .returning();

  if (!updatedSpan) {
    throw new Error("Span not found");
  }

  return updatedSpan;
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
