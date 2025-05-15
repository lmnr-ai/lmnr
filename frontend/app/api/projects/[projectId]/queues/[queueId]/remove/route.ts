import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db/drizzle";
import { datasetDatapoints, labelingQueueItems } from "@/lib/db/migrations/schema";

const removeQueueItemSchema = z.object({
  id: z.string(),
  skip: z.boolean().optional(),
  datasetId: z.string().optional(),
  data: z.any(),
  target: z.any(),
  metadata: z.any(),
});

export async function POST(request: Request, props: { params: Promise<{ projectId: string; queueId: string }> }) {
  const params = await props.params;
  const queueId = params.queueId;

  const body = await request.json();
  const result = removeQueueItemSchema.safeParse(body);

  if (!result.success) {
    return new Response(JSON.stringify({ error: "Invalid request body", details: result.error }), {
      status: 400,
    });
  }

  const { id, data, target, metadata, datasetId, skip } = result.data;

  if (skip) {
    await db
      .delete(labelingQueueItems)
      .where(and(eq(labelingQueueItems.queueId, queueId), eq(labelingQueueItems.id, id)));
  } else if (datasetId) {
    await db.transaction(async (tx) => {
      await tx.insert(datasetDatapoints).values({
        data,
        target,
        metadata,
        datasetId,
      });

      await tx
        .delete(labelingQueueItems)
        .where(and(eq(labelingQueueItems.queueId, params.queueId), eq(labelingQueueItems.id, id)));
    });
  }

  return new Response(JSON.stringify({ success: true }));
}
