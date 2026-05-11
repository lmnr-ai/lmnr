import { type labelingQueues } from "@/lib/db/migrations/schema";

export type LabelingQueue = typeof labelingQueues.$inferSelect;

/**
 * Per-queue lifecycle counts derived from `labeling_queue_items`. Shared
 * between the server-side aggregator (`getQueueProgresses`) and the UI store
 * (`computeProgress` over a single queue's loaded items).
 */
export interface QueueProgress {
  total: number;
  new: number;
  modified: number;
  approved: number;
}

export const EMPTY_PROGRESS: QueueProgress = { total: 0, new: 0, modified: 0, approved: 0 };

export type LabelingQueueWithProgress = LabelingQueue & { progress: QueueProgress };

/**
 * Labeling queue item. The per-item rows live in ClickHouse as
 * `labeling_queue_items` (see `frontend/lib/clickhouse/migrations/42_labeling_queue_items.sql`).
 *
 * ReplacingMergeTree(updated_at) — writes append; reads must use `FINAL` to
 * collapse the most-recent version of each `(project_id, queue_id, id)` row.
 *
 * `payload` is **immutable** after insert: it carries the original
 * `{data, target, metadata}` set when the item was queued. The separate
 * `edit` column holds the **canonical current target** as a JSON string —
 * seeded equal to `payload.target` on insert and overwritten by every UI
 * edit (mirror model). Dirty is a structural compare between the two so
 * reverting an edit to the original answer correctly drops the dirty flag.
 * On export the effective target is just `JSON.parse(edit)`.
 */
export interface LabelingQueueItem {
  id: string;
  queueId: string;
  projectId: string;
  payload: {
    data: unknown;
    target: unknown;
    metadata?: Record<string, unknown>;
  };
  /**
   * Canonical current target as a JSON string. Seeded equal to
   * `payload.target` on insert; never empty for fresh rows.
   */
  edit: string;
  metadata: Record<string, unknown>;
  /** 0 = unlabeled, 1 = approved. */
  status: 0 | 1;
  createdAt: string;
  updatedAt: string;
}
