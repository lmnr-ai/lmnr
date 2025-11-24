import { and, desc, eq, getTableColumns, ilike, inArray, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { db } from "@/lib/db/drizzle";
import { labelingQueueItems, labelingQueues } from "@/lib/db/migrations/schema";
import { FilterDef } from "@/lib/db/modifiers";
import { paginatedGet } from "@/lib/db/utils";

export type Queue = {
  id: string;
  name: string;
  projectId: string;
  createdAt: string;
  count: number;
};

export const GetQueuesSchema = z.object({
  projectId: z.string(),
  pageNumber: z.coerce.number().default(0),
  pageSize: z.coerce.number().default(50),
  search: z.string().nullable().optional(),
  filter: z.array(z.any()).optional().default([]),
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
  const { projectId, pageNumber, pageSize, search, filter } = GetQueuesSchema.parse(input);

  const filters = [eq(labelingQueues.projectId, projectId)];

  if (search) {
    filters.push(ilike(labelingQueues.name, `%${search}%`));
  }

  if (filter && Array.isArray(filter)) {
    filter.forEach((filterItem) => {
      try {
        const f: FilterDef = typeof filterItem === "string" ? JSON.parse(filterItem) : filterItem;
        const { column, operator, value } = f;
        const operatorStr = operator as string;

        if (column === "name") {
          if (operator === "eq") filters.push(eq(labelingQueues.name, value));
          else if (operatorStr === "contains") filters.push(ilike(labelingQueues.name, `%${value}%`));
        } else if (column === "id") {
          if (operator === "eq") filters.push(eq(labelingQueues.id, value));
          else if (operatorStr === "contains") filters.push(ilike(labelingQueues.id, `%${value}%`));
        }
      } catch (error) {}
    });
  }

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