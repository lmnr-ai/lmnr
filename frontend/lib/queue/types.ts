import { labelingQueues } from "@/lib/db/schema";

export type LabelQueue = typeof labelingQueues.$inferSelect;
