import { and, desc, eq, getTableColumns, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { db } from "@/lib/db/drizzle";
import { labelingQueueItems, labelingQueues } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";

export const GetQueuesSchema = PaginationFiltersSchema.extend({
  projectId: z.string(),
  search: z.string().nullable().optional(),
});

export const CreateQueueSchema = z.object({
  projectId: z.string(),
  name: z.string().min(1, "Name is required"),
});

export const DeleteQueuesSchema = z.object({
  projectId: z.string(),
  queueIds: z.array(z.string()).min(1, "At least one queue id is required"),
});

export async function getQueues(input: z.infer<typeof GetQueuesSchema>) {
  const { projectId, pageNumber, pageSize, search, filter } = input;

  const filters = [eq(labelingQueues.projectId, projectId)];

  if (search) {
    filters.push(ilike(labelingQueues.name, `%${search}%`));
  }

  const filterConditions = parseFilters(filter, {
    name: { type: "string", column: labelingQueues.name },
    id: { type: "string", column: labelingQueues.id },
  } as const);
  filters.push(...filterConditions);

  const queuesData = await paginatedGet({
    table: labelingQueues,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(labelingQueues.createdAt)],
    columns: {
      ...getTableColumns(labelingQueues),
      count: sql<number>`COALESCE((
        SELECT COUNT(*)
        FROM ${labelingQueueItems} lqi
        WHERE lqi.queue_id = labeling_queues.id
      ), 0)::int`,
    },
  });

  return queuesData;
}

export async function createQueue(input: z.infer<typeof CreateQueueSchema>) {
  const { projectId, name } = CreateQueueSchema.parse(input);

  const [queue] = await db
    .insert(labelingQueues)
    .values({
      name,
      projectId,
    })
    .returning();

  return queue;
}

export async function deleteQueues(input: z.infer<typeof DeleteQueuesSchema>) {
  const { projectId, queueIds } = DeleteQueuesSchema.parse(input);

  await db
    .delete(labelingQueues)
    .where(and(inArray(labelingQueues.id, queueIds), eq(labelingQueues.projectId, projectId)));

  return { success: true };
}
