import { and, asc, desc, eq, gt, lt, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { createDatapoints } from "@/lib/clickhouse/datapoints";
import { db } from "@/lib/db/drizzle";
import { labelingQueueItems, labelingQueues } from "@/lib/db/migrations/schema";
import { generateUuid } from "@/lib/utils";

export const MoveQueueSchema = z.object({
  queueId: z.string(),
  refDate: z.string(),
  refId: z.string(),
  direction: z.enum(["next", "prev"]),
});

export const MoveQueueRequestSchema = MoveQueueSchema.pick({ refDate: true, refId: true, direction: true });

export const PushQueueItemSchema = z.object({
  queueId: z.string(),
  items: z.array(
    z.object({
      createdAt: z.string().optional(),
      payload: z.object({
        data: z.any(),
        target: z.any(),
        metadata: z.record(z.string(), z.any()),
      }),
      metadata: z.object({
        source: z.enum(["span", "datapoint"]).optional(),
        datasetId: z.string().optional(),
        traceId: z.string().optional(),
        id: z.string().optional(),
      }),
    })
  ),
});

export const PushQueueItemsRequestSchema = PushQueueItemSchema.shape.items;

export const RemoveQueueItemSchema = z.object({
  queueId: z.string(),
  id: z.string(),
  skip: z.boolean().optional(),
  datasetId: z.string().optional(),
  data: z.any(),
  target: z.any(),
  metadata: z.record(z.string(), z.any()),
  projectId: z.string(),
});

export const RemoveQueueItemRequestSchema = RemoveQueueItemSchema.omit({ queueId: true, projectId: true });

export async function moveQueueItem(input: z.infer<typeof MoveQueueSchema>) {
  const { queueId, refDate, refId, direction } = MoveQueueSchema.parse(input);

  const [{ count }] = await db
    .select({
      count: sql<number>`count(*)::int4`,
    })
    .from(labelingQueueItems)
    .where(eq(labelingQueueItems.queueId, queueId));

  if (direction === "next") {
    // Use compound ordering: (created_at, id) to handle items with same timestamp
    // Find items where (created_at > refDate) OR (created_at = refDate AND id > refId)
    const nextItem = await db.query.labelingQueueItems.findFirst({
      where: and(
        eq(labelingQueueItems.queueId, queueId),
        sql`(${labelingQueueItems.createdAt} > ${refDate} OR (${labelingQueueItems.createdAt} = ${refDate} AND ${labelingQueueItems.id} > ${refId}))`
      ),
      orderBy: [asc(labelingQueueItems.createdAt), asc(labelingQueueItems.id)],
    });

    if (!nextItem) {
      return null;
    }

    const [{ position }] = await db
      .select({
        position: sql<number>`(
          SELECT COUNT(*)::int4
          FROM labeling_queue_items
          WHERE queue_id = ${queueId}
          AND (created_at < ${nextItem.createdAt} OR (created_at = ${nextItem.createdAt} AND id < ${nextItem.id}))
        ) + 1`,
      })
      .from(labelingQueueItems)
      .where(eq(labelingQueueItems.queueId, queueId));

    return {
      ...nextItem,
      count,
      position,
    };
  } else if (direction === "prev") {
    // Use compound ordering: (created_at, id) to handle items with same timestamp
    // Find items where (created_at < refDate) OR (created_at = refDate AND id < refId)
    const prevItem = await db.query.labelingQueueItems.findFirst({
      where: and(
        eq(labelingQueueItems.queueId, queueId),
        sql`(${labelingQueueItems.createdAt} < ${refDate} OR (${labelingQueueItems.createdAt} = ${refDate} AND ${labelingQueueItems.id} < ${refId}))`
      ),
      orderBy: [desc(labelingQueueItems.createdAt), desc(labelingQueueItems.id)],
    });

    if (!prevItem) {
      return null;
    }

    const [{ position }] = await db
      .select({
        position: sql<number>`(
          SELECT COUNT(*)::int4
          FROM labeling_queue_items
          WHERE queue_id = ${queueId}
          AND (created_at < ${prevItem.createdAt} OR (created_at = ${prevItem.createdAt} AND id < ${prevItem.id}))
        ) + 1`,
      })
      .from(labelingQueueItems)
      .where(eq(labelingQueueItems.queueId, queueId));

    return {
      ...prevItem,
      count,
      position,
    };
  }

  throw new Error("Invalid direction");
}

export async function pushQueueItems(input: z.infer<typeof PushQueueItemSchema>) {
  const { queueId, items } = PushQueueItemSchema.parse(input);

  const queueItems = items.map((item) => ({
    ...item,
    queueId,
  }));

  const newQueueItems = await db.insert(labelingQueueItems).values(queueItems).returning();

  if (newQueueItems.length === 0) {
    throw new Error("Failed to push items to queue");
  }

  return newQueueItems;
}

export async function removeQueueItem(input: z.infer<typeof RemoveQueueItemSchema>) {
  const { queueId, id, skip, datasetId, data, target, metadata, projectId } = RemoveQueueItemSchema.parse(input);

  if (skip) {
    await db
      .delete(labelingQueueItems)
      .where(and(eq(labelingQueueItems.queueId, queueId), eq(labelingQueueItems.id, id)));
  } else if (datasetId) {
    await db
      .delete(labelingQueueItems)
      .where(and(eq(labelingQueueItems.queueId, queueId), eq(labelingQueueItems.id, id)));

    await createDatapoints(projectId, datasetId, [
      {
        id: generateUuid(),
        data,
        target,
        metadata,
        createdAt: new Date().toISOString(),
      },
    ]);
  } else {
    throw new Error("Invalid request parameters - either skip must be true or datasetId must be provided");
  }
}

export const UpdateQueueAnnotationSchemaSchema = z.object({
  projectId: z.string(),
  queueId: z.string(),
  annotationSchema: z.record(z.string(), z.unknown()).nullable(),
});

export async function updateQueueAnnotationSchema(input: z.infer<typeof UpdateQueueAnnotationSchemaSchema>) {
  const { queueId, projectId, annotationSchema } = UpdateQueueAnnotationSchemaSchema.parse(input);

  const [updatedQueue] = await db
    .update(labelingQueues)
    .set({ annotationSchema })
    .where(and(eq(labelingQueues.projectId, projectId), eq(labelingQueues.id, queueId)))
    .returning();

  if (!updatedQueue) {
    throw new Error("Failed to update queue annotation schema");
  }

  return updatedQueue;
}
