import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createDatapoints } from "@/lib/actions/datapoints";
import { pushQueueItems } from "@/lib/actions/queue";
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

  const span = await db.query.spans.findFirst({
    where: and(eq(spans.spanId, spanId), eq(spans.projectId, projectId)),
  });

  if (!span) {
    throw new Error("Span not found");
  }

  return span;
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
