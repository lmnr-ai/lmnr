import { type labelingQueueItems, type labelingQueues } from "@/lib/db/migrations/schema";

export type LabelingQueue = typeof labelingQueues.$inferSelect;

export type LabelingQueueItem = typeof labelingQueueItems.$inferSelect;
