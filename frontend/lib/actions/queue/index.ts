import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createDatapoints } from "@/lib/clickhouse/datapoints";
import {
  deleteQueueItems,
  filterExistingIdempotencyKeys,
  getLabelledQueueItems,
  getQueueCounts,
  getQueueItems,
  insertQueueItems,
  updateQueueItem,
} from "@/lib/clickhouse/labeling-queue-items";
import { db } from "@/lib/db/drizzle";
import { labelingQueues } from "@/lib/db/migrations/schema";
import { generateUuid, queueItemIdForIdempotency } from "@/lib/utils";

const PayloadSchema = z.object({
  data: z.any(),
  target: z.any(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const ItemMetadataSchema = z
  .object({
    source: z.enum(["span", "datapoint", "sql"]).optional(),
    datasetId: z.guid().optional(),
    traceId: z.guid().optional(),
    id: z.string().optional(),
  })
  .passthrough();

export const PushQueueItemSchema = z.object({
  queueId: z.guid(),
  projectId: z.guid(),
  items: z.array(
    z.object({
      createdAt: z.string().optional(),
      payload: PayloadSchema,
      metadata: ItemMetadataSchema,
      idempotencyKey: z.string().optional(),
    })
  ),
});

export const PushQueueItemsRequestSchema = PushQueueItemSchema.shape.items;

export const UpdateQueueItemTargetSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  id: z.guid(),
  target: z.any(),
  isLabelled: z.boolean().optional(),
});

export const RemoveQueueItemSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  id: z.guid(),
  skip: z.boolean().optional(),
  datasetId: z.guid().optional(),
  data: z.any(),
  target: z.any(),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const RemoveQueueItemRequestSchema = RemoveQueueItemSchema.omit({
  queueId: true,
  projectId: true,
});

export const PushItemsToDatasetSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  datasetId: z.guid(),
  itemIds: z.array(z.guid()).optional(),
});

export const GetQueueItemsSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
});

export const GetQueueProgressSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
});

export const UpdateQueueTargetSchemaSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  targetSchema: z.record(z.string(), z.unknown()).nullable(),
});

export async function pushQueueItems(input: z.infer<typeof PushQueueItemSchema>) {
  const { queueId, projectId, items } = PushQueueItemSchema.parse(input);
  if (items.length === 0) return [];

  const withKeys = items.map((item) => ({
    ...item,
    idempotencyKey: item.idempotencyKey ?? "",
  }));

  const existing = await filterExistingIdempotencyKeys(
    projectId,
    queueId,
    withKeys.map((i) => i.idempotencyKey)
  );

  const now = new Date().toISOString();
  const toInsert = withKeys
    .filter((item) => item.idempotencyKey === "" || !existing.has(item.idempotencyKey))
    .map((item) => ({
      // Derive a deterministic id from `idempotencyKey` so two concurrent inserts
      // that both slip past `filterExistingIdempotencyKeys` collide on the RMT
      // ORDER BY `(project_id, queue_id, id)` and collapse on FINAL — instead of
      // producing two distinct-`id` rows RMT will never dedupe.
      id: queueItemIdForIdempotency(projectId, queueId, item.idempotencyKey),
      queueId,
      projectId,
      payload: item.payload,
      metadata: item.metadata ?? {},
      isLabelled: false,
      idempotencyKey: item.idempotencyKey,
      createdAt: item.createdAt ?? now,
      updatedAt: item.createdAt ?? now,
    }));

  await insertQueueItems(toInsert);

  return toInsert.map((item) => ({
    id: item.id,
    queueId: item.queueId,
    projectId: item.projectId,
    createdAt: item.createdAt,
  }));
}

export async function updateQueueItemTarget(input: z.infer<typeof UpdateQueueItemTargetSchema>) {
  const parsed = UpdateQueueItemTargetSchema.parse(input);

  // Delegate the read-modify-write entirely to `updateQueueItem`: one FINAL
  // SELECT there splices the new target into the existing payload AND returns
  // the immutable fields (createdAt, idempotency_key) we need to preserve.
  await updateQueueItem({
    id: parsed.id,
    queueId: parsed.queueId,
    projectId: parsed.projectId,
    target: parsed.target,
    isLabelled: parsed.isLabelled,
  });

  return { success: true };
}

export async function removeQueueItem(input: z.infer<typeof RemoveQueueItemSchema>) {
  const { queueId, id, skip, datasetId, data, target, metadata, projectId } = RemoveQueueItemSchema.parse(input);

  if (skip) {
    await deleteQueueItems(projectId, queueId, [id]);
    return { success: true };
  }

  if (datasetId) {
    await deleteQueueItems(projectId, queueId, [id]);
    await createDatapoints(projectId, datasetId, [
      {
        id: generateUuid(),
        data,
        target,
        metadata: metadata ?? {},
        createdAt: new Date().toISOString(),
      },
    ]);
    return { success: true };
  }

  throw new Error("Invalid request parameters - either skip must be true or datasetId must be provided");
}

export async function pushItemsToDataset(input: z.infer<typeof PushItemsToDatasetSchema>) {
  const { projectId, queueId, datasetId, itemIds } = PushItemsToDatasetSchema.parse(input);

  const labelled = await getLabelledQueueItems(projectId, queueId);

  const targetItems = itemIds && itemIds.length > 0 ? labelled.filter((i) => itemIds.includes(i.id)) : labelled;

  if (targetItems.length === 0) {
    return { pushed: 0 };
  }

  const now = new Date().toISOString();
  await createDatapoints(
    projectId,
    datasetId,
    targetItems.map((item) => ({
      id: generateUuid(),
      data: (item.payload as { data?: unknown }).data ?? {},
      target: (item.payload as { target?: unknown }).target ?? null,
      metadata: (item.payload as { metadata?: unknown }).metadata ?? item.metadata ?? {},
      createdAt: now,
    }))
  );

  await deleteQueueItems(
    projectId,
    queueId,
    targetItems.map((i) => i.id)
  );

  return { pushed: targetItems.length };
}

export async function listQueueItems(input: z.infer<typeof GetQueueItemsSchema>) {
  const { projectId, queueId } = GetQueueItemsSchema.parse(input);
  return getQueueItems(projectId, queueId);
}

export async function getQueueProgress(input: z.infer<typeof GetQueueProgressSchema>) {
  const { projectId, queueId } = GetQueueProgressSchema.parse(input);
  return getQueueCounts(projectId, queueId);
}

export async function updateQueueTargetSchema(input: z.infer<typeof UpdateQueueTargetSchemaSchema>) {
  const { queueId, projectId, targetSchema } = UpdateQueueTargetSchemaSchema.parse(input);

  const [updatedQueue] = await db
    .update(labelingQueues)
    .set({ targetSchema })
    .where(and(eq(labelingQueues.projectId, projectId), eq(labelingQueues.id, queueId)))
    .returning();

  if (!updatedQueue) {
    throw new Error("Failed to update queue target schema");
  }

  return updatedQueue;
}
