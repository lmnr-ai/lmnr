import { type labelingQueues } from "@/lib/db/migrations/schema";

export type LabelingQueue = typeof labelingQueues.$inferSelect;

/**
 * Labeling queue item. The per-item rows live in ClickHouse as
 * `labeling_queue_items` (see `frontend/lib/clickhouse/migrations/42_labeling_queue_items.sql`).
 *
 * ReplacingMergeTree(updated_at) — writes append; reads must use `FINAL` to
 * collapse the most-recent version of each `(project_id, queue_id, id)` row.
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
  metadata: Record<string, unknown>;
  isLabelled: boolean;
  idempotencyKey: string;
  createdAt: string;
  updatedAt: string;
}
