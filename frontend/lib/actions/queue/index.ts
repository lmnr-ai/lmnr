import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { createDatapoints } from "@/lib/clickhouse/datapoints";
import { db } from "@/lib/db/drizzle";
import { labelingQueues } from "@/lib/db/migrations/schema";
import { type LabelingQueueItem } from "@/lib/queue/types";
import { generateUuid, tryParseJson } from "@/lib/utils";

import {
  deleteQueueItems,
  getApprovedQueueItems,
  getQueueItems,
  getQueueItemStates,
  insertQueueItems,
  updateQueueItem,
} from "./items";

export type { QueueItemState, QueueItemStateRow } from "./items";

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
  .loose();

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

/**
 * PATCH input for an existing queue item. Only `edit` (UI-only) and `status`
 * are mutable; `payload` is immutable post-insert. `edit` is the canonical
 * current target (seeded equal to `payload.target` on insert) — overwrite it
 * to change the current target; omit it to leave the column untouched.
 */
export const UpdateQueueItemEditSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  id: z.guid(),
  edit: z.string().optional(),
  status: z.union([z.literal(0), z.literal(1)]).optional(),
});

export const RemoveQueueItemSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  id: z.guid(),
  skip: z.boolean().optional(),
  datasetId: z.guid().optional(),
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
   * When true, push every queue item regardless of `status`. This is the
   * "ship everything that's in the queue right now" escape hatch — un-annotated
   * items will land in the dataset with whatever (possibly empty) effective
   * target they carry. Default false to preserve the historical
   * "approved-only" contract.
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

export const GetQueueItemStatesSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
});

export const UpdateQueueAnnotationSchemaSchema = z.object({
  projectId: z.guid(),
  queueId: z.guid(),
  annotationSchema: z.record(z.string(), z.unknown()).nullable(),
});

/**
 * Effective target for export. Under the mirror model `edit` is always the
 * canonical current target — seeded equal to `payload.target` on insert and
 * updated by every UI edit. The `payload.target` fallback is defensive for
 * any pre-mirror rows that might still have `edit = ""`; if you hit it on
 * fresh data something further upstream lost the seed.
 */
const effectiveTarget = (item: LabelingQueueItem): unknown => {
  if (item.edit && item.edit.length > 0) {
    return tryParseJson(item.edit) ?? (item.payload as { target?: unknown }).target ?? null;
  }
  return (item.payload as { target?: unknown }).target ?? null;
};

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
    edit: JSON.stringify(item.payload.target ?? null),
    status: 0 as const,
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

export async function updateQueueItemEdit(input: z.infer<typeof UpdateQueueItemEditSchema>) {
  const parsed = UpdateQueueItemEditSchema.parse(input);

  // Delegate the read-modify-write entirely to `updateQueueItem`: one FINAL
  // SELECT there preserves the immutable fields (payload, metadata, createdAt,
  // idempotency_key) while writing only the mutable columns (edit, status).
  await updateQueueItem({
    id: parsed.id,
    queueId: parsed.queueId,
    projectId: parsed.projectId,
    edit: parsed.edit,
    status: parsed.status,
  });

  return { success: true };
}

export async function removeQueueItem(input: z.infer<typeof RemoveQueueItemSchema>) {
  const { queueId, id, skip, datasetId, projectId } = RemoveQueueItemSchema.parse(input);

  if (skip) {
    await deleteQueueItems(projectId, queueId, [id]);
    return { success: true };
  }

  if (datasetId) {
    const [item] = await getQueueItems(projectId, queueId, { ids: [id] });
    if (!item) {
      throw new Error("Queue item not found");
    }

    const payloadMetadata = (item.payload as { metadata?: unknown }).metadata;
    await createDatapoints(projectId, datasetId, [
      {
        id: generateUuid(),
        data: (item.payload as { data?: unknown }).data ?? {},
        target: effectiveTarget(item),
        metadata: payloadMetadata ?? item.metadata ?? {},
        createdAt: new Date().toISOString(),
      },
    ]);
    await deleteQueueItems(projectId, queueId, [id]);
    return { success: true };
  }

  throw new Error("Invalid request parameters - either skip must be true or datasetId must be provided");
}

export async function pushItemsToDataset(input: z.infer<typeof PushItemsToDatasetSchema>) {
  const { projectId, queueId, datasetId, itemIds, includeUnlabelled } = PushItemsToDatasetSchema.parse(input);

  // `includeUnlabelled` opts out of the approved-only filter that the API used
  // to enforce unconditionally. Callers that don't pass it keep the safe
  // default (only push reviewed rows). When `itemIds` is provided we push it
  // down into the ClickHouse `IN (...)` filter rather than fetching every row
  // and filtering client-side — `payload`/`edit` can be tens of kB per row, so
  // a single-item push on a queue with thousands of items previously dragged
  // the entire queue over the wire.
  const fetchOpts = itemIds && itemIds.length > 0 ? { ids: itemIds } : undefined;
  const targetItems = includeUnlabelled
    ? await getQueueItems(projectId, queueId, fetchOpts)
    : await getApprovedQueueItems(projectId, queueId, fetchOpts);

  if (targetItems.length === 0) {
    return { pushed: 0 };
  }

  const now = new Date().toISOString();
  const toInsert = targetItems.map((item) => ({
    id: generateUuid(),
    data: (item.payload as { data?: unknown }).data ?? {},
    target: effectiveTarget(item),
    metadata: (item.payload as { metadata?: unknown }).metadata ?? item.metadata ?? {},
    createdAt: now,
  }));

  // Create before delete so a failed insert leaves the queue rows intact for
  // retry. dataset_datapoints is plain MergeTree — if the delete then fails
  // and the user retries, they'll get duplicate datapoints. Acceptable; the
  // UI guards this path so retries are a deliberate action.
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

export async function listQueueItemStates(input: z.infer<typeof GetQueueItemStatesSchema>) {
  const { projectId, queueId } = GetQueueItemStatesSchema.parse(input);
  return getQueueItemStates(projectId, queueId);
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
