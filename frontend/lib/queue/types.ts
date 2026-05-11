import { type labelingQueues } from "@/lib/db/migrations/schema";

export type LabelingQueue = typeof labelingQueues.$inferSelect;

export interface QueueProgress {
  total: number;
  new: number;
  modified: number;
  approved: number;
}

export const EMPTY_PROGRESS: QueueProgress = { total: 0, new: 0, modified: 0, approved: 0 };

export type LabelingQueueWithProgress = LabelingQueue & { progress: QueueProgress };

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
