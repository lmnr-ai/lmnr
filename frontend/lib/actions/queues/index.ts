import { and, desc, eq, getTableColumns, ilike, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { deleteQueueItemsByQueueIds } from "@/lib/clickhouse/labeling-queue-items";
import { db } from "@/lib/db/drizzle";
import { labelingQueues } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";

export const GetQueuesSchema = PaginationFiltersSchema.extend({
  projectId: z.guid(),
  search: z.string().nullable().optional(),
});

export const CreateQueueSchema = z.object({
  projectId: z.guid(),
  name: z.string().min(1, "Name is required"),
});

export const DeleteQueuesSchema = z.object({
  projectId: z.guid(),
  queueIds: z.array(z.string()).min(1, "At least one queue id is required"),
});

export async function getQueues(input: z.infer<typeof GetQueuesSchema>) {
  const { projectId, pageNumber, pageSize, search, filter } = input;

  // Item count filters were previously evaluated via a SQL subquery. Queue
  // items now live in ClickHouse, so per-queue counts would require a
  // cross-datastore join. We no longer support the `count` filter in the list
  // endpoint; filters on name/id still work through Postgres.
  const pgFilters = (filter ?? []).filter((f) => f.column !== "count");

  const filters = [
    eq(labelingQueues.projectId, projectId),
    ...parseFilters(pgFilters, {
      name: { type: "string", column: labelingQueues.name },
      id: { type: "string", column: labelingQueues.id },
    } as const),
  ];

  if (search) {
    filters.push(ilike(labelingQueues.name, `%${search}%`));
  }

  return paginatedGet({
    table: labelingQueues,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(labelingQueues.createdAt)],
    columns: {
      ...getTableColumns(labelingQueues),
    },
  });
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

  // Clean up queue items in ClickHouse first — FK cascades only cover Postgres.
  await deleteQueueItemsByQueueIds(projectId, queueIds);

  await db
    .delete(labelingQueues)
    .where(and(inArray(labelingQueues.id, queueIds), eq(labelingQueues.projectId, projectId)));

  return { success: true };
}
