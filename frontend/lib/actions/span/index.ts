import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createDatapoints } from "@/lib/actions/datapoints";
import { pushQueueItems } from "@/lib/actions/queue";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { spans } from "@/lib/db/migrations/schema";
import { downloadSpanImages } from "@/lib/spans/utils";

export const GetSpanSchema = z.object({
  spanId: z.string(),
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
        attributes: true,
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
        SELECT input, output
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

  const chData = (await chResult.json()) as [{ input: string; output: string }];
  const { input: spanInput, output: spanOutput } = chData[0] || {};

  return {
    ...dbSpan,
    input: tryParseJson(spanInput),
    output: tryParseJson(spanOutput),
  };
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

const tryParseJson = (value: string) => {
  if (value === "") return null;

  try {
    return JSON.parse(value);
  } catch (e) {
    // Parse with brackets because we stringify array using comma separator on server.
    try {
      return JSON.parse(`[${value}]`);
    } catch (e2) {
      console.log("Failed to parse JSON with brackets:", e2);
      return value;
    }
  }
};
