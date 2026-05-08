import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createDatapoints, filterExistingDatapointIds } from "@/lib/clickhouse/datapoints";
import {
  deleteQueueItems,
  getLabelledQueueItems,
  getQueueCounts,
  getQueueItemIds,
  getQueueItems,
  insertQueueItems,
  updateQueueItem,
} from "@/lib/clickhouse/labeling-queue-items";
import { db } from "@/lib/db/drizzle";
import { labelingQueues } from "@/lib/db/migrations/schema";
import { datapointIdForQueueItem, generateUuid } from "@/lib/utils";

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
  /**
   * When true, push every queue item regardless of `is_labelled`. This is the
   * "ship everything that's in the queue right now" escape hatch — un-annotated
   * items will land in the dataset with whatever (possibly empty) `target` they
   * carry. Default false to preserve the historical "approved-only" contract.
   */
  includeUnlabelled: z.boolean().optional(),
});

export const GetQueueItemsSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  /**
   * Optional id filter for the windowed UI: when present we return ONLY those
   * rows (still in `(created_at, id)` order). Omit to fall back to the
   * historical "return everything" contract callers without windowing rely on.
   */
  ids: z.array(z.guid()).optional(),
});

export const GetQueueItemIdsSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
});

export const GetQueueProgressSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
});

export const UpdateQueueAnnotationSchemaSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  annotationSchema: z.record(z.string(), z.unknown()).nullable(),
});

export async function pushQueueItems(input: z.infer<typeof PushQueueItemSchema>) {
  const { queueId, projectId, items } = PushQueueItemSchema.parse(input);
  if (items.length === 0) return [];

  const now = new Date().toISOString();
  const toInsert = items.map((item) => ({
    id: generateUuid(),
    queueId,
    projectId,
    payload: item.payload,
    metadata: item.metadata ?? {},
    isLabelled: false,
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
    // Deterministic datapoint id + create-before-delete + idempotent insert.
    // createDatapoints and deleteQueueItems are two separate ClickHouse writes
    // with no transaction. Without this: (a) a random id would make a retry
    // after a partial failure duplicate the dataset row, and (b) deleting
    // first would lose the queue item if the insert then threw. With this:
    // insert uses the same id on every retry, and `filterExistingDatapointIds`
    // skips the re-insert (dataset_datapoints is plain MergeTree — duplicate
    // ids do NOT collapse on merge).
    const datapointId = datapointIdForQueueItem(datasetId, id);
    const existing = await filterExistingDatapointIds(projectId, datasetId, [datapointId]);
    if (!existing.has(datapointId)) {
      await createDatapoints(projectId, datasetId, [
        {
          id: datapointId,
          data,
          target,
          metadata: metadata ?? {},
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    await deleteQueueItems(projectId, queueId, [id]);
    return { success: true };
  }

  throw new Error("Invalid request parameters - either skip must be true or datasetId must be provided");
}

export async function pushItemsToDataset(input: z.infer<typeof PushItemsToDatasetSchema>) {
  const { projectId, queueId, datasetId, itemIds, includeUnlabelled } = PushItemsToDatasetSchema.parse(input);

  // `includeUnlabelled` opts out of the labelled-only filter that the API used
  // to enforce unconditionally. Callers that don't pass it keep the safe
  // default (only push reviewed rows) — see the CLAUDE.md note on this fn.
  const sourceItems = includeUnlabelled
    ? await getQueueItems(projectId, queueId)
    : await getLabelledQueueItems(projectId, queueId);

  const targetItems = itemIds && itemIds.length > 0 ? sourceItems.filter((i) => itemIds.includes(i.id)) : sourceItems;

  if (targetItems.length === 0) {
    return { pushed: 0 };
  }

  // Derive a deterministic datapoint id per queue item. createDatapoints +
  // deleteQueueItems are two separate ClickHouse writes with no transaction:
  // if the delete fails (or the process crashes) after the insert succeeds,
  // the items stay in the queue and the user retries. Without deterministic
  // ids the retry would insert a second set of datapoints — dataset_datapoints
  // is MergeTree, so duplicate-keyed retries persist as distinct rows. We
  // filter out already-inserted ids so the retry only writes what's missing
  // and then re-issues the delete.
  const datapointsById = new Map(targetItems.map((item) => [datapointIdForQueueItem(datasetId, item.id), item]));
  const existingIds = await filterExistingDatapointIds(projectId, datasetId, Array.from(datapointsById.keys()));

  const now = new Date().toISOString();
  const toInsert = Array.from(datapointsById.entries())
    .filter(([id]) => !existingIds.has(id))
    .map(([id, item]) => ({
      id,
      data: (item.payload as { data?: unknown }).data ?? {},
      target: (item.payload as { target?: unknown }).target ?? null,
      metadata: (item.payload as { metadata?: unknown }).metadata ?? item.metadata ?? {},
      createdAt: now,
    }));

  await createDatapoints(projectId, datasetId, toInsert);

  await deleteQueueItems(
    projectId,
    queueId,
    targetItems.map((i) => i.id)
  );

  return { pushed: targetItems.length };
}

export async function listQueueItems(input: z.infer<typeof GetQueueItemsSchema>) {
  const { projectId, queueId, ids } = GetQueueItemsSchema.parse(input);
  return getQueueItems(projectId, queueId, ids ? { ids } : undefined);
}

export async function listQueueItemIds(input: z.infer<typeof GetQueueItemIdsSchema>) {
  const { projectId, queueId } = GetQueueItemIdsSchema.parse(input);
  return getQueueItemIds(projectId, queueId);
}

export async function getQueueProgress(input: z.infer<typeof GetQueueProgressSchema>) {
  const { projectId, queueId } = GetQueueProgressSchema.parse(input);
  return getQueueCounts(projectId, queueId);
}

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
