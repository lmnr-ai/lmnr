import { labelingQueueData, labelingQueues } from "@/lib/db/schema";

export type LabelingQueue = typeof labelingQueues.$inferSelect;

export type LabelingQueueData = typeof labelingQueueData.$inferSelect;
