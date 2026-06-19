import { and, desc, eq, ilike, inArray } from "drizzle-orm";
import { partition } from "lodash";
import { z } from "zod/v4";

import { type Filter, parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import {
  deleteQueueItemsByQueueIds,
  findQueueIdsByProgress,
  getQueueProgresses,
  type ProgressColumn,
  type ProgressFilter,
  type ProgressOperator,
} from "@/lib/actions/queue/items";
import { db } from "@/lib/db/drizzle";
import { labelingQueues } from "@/lib/db/migrations/schema";
import { paginatedGet } from "@/lib/db/utils";
import { EMPTY_PROGRESS, type LabelingQueue, type LabelingQueueWithProgress } from "@/lib/queue/types";
import { type PaginatedResponse } from "@/lib/types";

const PROGRESS_COLUMNS: ReadonlySet<ProgressColumn> = new Set(["total", "new", "modified", "approved"]);
const PROGRESS_OPERATORS: ReadonlySet<ProgressOperator> = new Set(["eq", "ne", "gt", "gte", "lt", "lte"]);

const isProgressFilter = (f: Filter): f is Filter & ProgressFilter =>
  PROGRESS_COLUMNS.has(f.column as ProgressColumn) && PROGRESS_OPERATORS.has(f.operator as ProgressOperator);

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

export async function getQueues(
  input: z.infer<typeof GetQueuesSchema>
): Promise<PaginatedResponse<LabelingQueueWithProgress>> {
  const { projectId, pageNumber, pageSize, search, filter } = input;

  // Progress filters live in ClickHouse — pre-filter to qualifying queue ids
  // before the Postgres query. Combined with name/id filters they AND together.
  const [progressFilters, pgFilters] = partition(filter ?? [], isProgressFilter);

  const filters = [
    eq(labelingQueues.projectId, projectId),
    ...parseFilters(pgFilters, {
      name: { type: "string", column: labelingQueues.name },
      id: { type: "string", column: labelingQueues.id },
    } as const),
  ];

  if (progressFilters.length > 0) {
    const qualifyingIds = await findQueueIdsByProgress(projectId, progressFilters);
    if (qualifyingIds.length === 0) {
      return { items: [], totalCount: 0 };
    }
    filters.push(inArray(labelingQueues.id, qualifyingIds));
  }

  if (search) {
    filters.push(ilike(labelingQueues.name, `%${search}%`));
  }

  const page: PaginatedResponse<LabelingQueue> = await paginatedGet({
    table: labelingQueues,
    pageNumber,
    pageSize,
    filters,
    orderBy: [desc(labelingQueues.createdAt)],
    columns: {
      id: labelingQueues.id,
      name: labelingQueues.name,
      projectId: labelingQueues.projectId,
      createdAt: labelingQueues.createdAt,
    },
  });

  const progresses = await getQueueProgresses(
    projectId,
    page.items.map((q) => q.id)
  );

  return {
    items: page.items.map((q) => ({ ...q, progress: progresses[q.id] ?? EMPTY_PROGRESS })),
    totalCount: page.totalCount,
  };
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
