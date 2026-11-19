import { and, count, desc, eq, ilike, type SQL, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { datasetsV2, tasks, taskVersions } from "@/lib/db/migrations/schema";
import { ascNameFold } from "@/lib/db/utils";
import { type PaginatedResponse } from "@/lib/types";

import { type EvalDatasetListItem, type EvalDatasetTaskItem, type TaskVersion } from "./types";

export * from "./types";

const PageSchema = z.object({
  projectId: z.guid(),
  pageNumber: z.coerce.number().int().min(0).default(0),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

const DatasetSchema = z.object({
  projectId: z.guid(),
  datasetName: z.string().min(1),
});

const TaskSchema = DatasetSchema.extend({ taskName: z.string().min(1) });

const TasksPageSchema = PageSchema.extend({ search: z.string().nullish() });

/** `%`, `_` and `\` match literally in an ILIKE pattern. */
const likeContains = (text: string) => `%${text.replace(/[\\%_]/g, "\\$&")}%`;

export const getEvalDatasets = async (
  input: z.input<typeof PageSchema>
): Promise<PaginatedResponse<EvalDatasetListItem>> => {
  const { projectId, pageNumber, pageSize } = PageSchema.parse(input);

  const inDataset = (table: typeof tasks | typeof taskVersions) =>
    sql`${table.projectId} = ${datasetsV2.projectId} AND ${table.datasetId} = ${datasetsV2.id}`;

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        name: datasetsV2.id,
        createdAt: datasetsV2.createdAt,
        taskCount: sql<number>`(SELECT count(*)::int FROM ${tasks} WHERE ${inDataset(tasks)})`,
        updatedAt: sql<string>`coalesce((SELECT max(${taskVersions.createdAt}) FROM ${taskVersions} WHERE ${inDataset(taskVersions)}), ${datasetsV2.createdAt})`,
      })
      .from(datasetsV2)
      .where(eq(datasetsV2.projectId, projectId))
      .orderBy(...ascNameFold(datasetsV2.id))
      .limit(pageSize)
      .offset(pageNumber * pageSize),
    db.select({ total: count() }).from(datasetsV2).where(eq(datasetsV2.projectId, projectId)),
  ]);

  return { items, totalCount: total };
};

/** The project's dataset with this name, or null. */
export const getEvalDataset = async (input: z.input<typeof DatasetSchema>) => {
  const { projectId, datasetName } = DatasetSchema.parse(input);
  const dataset = await db.query.datasetsV2.findFirst({
    columns: { id: true, createdAt: true },
    where: and(eq(datasetsV2.projectId, projectId), eq(datasetsV2.id, datasetName)),
  });
  return dataset ? { name: dataset.id, createdAt: dataset.createdAt } : null;
};

const requireDataset = async (input: z.input<typeof DatasetSchema>) => {
  const dataset = await getEvalDataset(input);
  if (!dataset) throw new NotFoundError("Eval dataset not found");
  return dataset;
};

/** A dataset's tasks with their latest version (greatest `created_at`, then hash), by name. */
export const getEvalDatasetTasks = async (
  input: z.input<typeof TasksPageSchema> & z.input<typeof DatasetSchema>
): Promise<PaginatedResponse<EvalDatasetTaskItem>> => {
  const { projectId, pageNumber, pageSize, search } = TasksPageSchema.parse(input);
  const { name: dataset } = await requireDataset(input);

  const filters: SQL[] = [eq(tasks.projectId, projectId), eq(tasks.datasetId, dataset)];
  if (search?.trim()) filters.push(ilike(tasks.id, likeContains(search.trim())));
  const where = and(...filters);

  const ofTask = and(
    eq(taskVersions.projectId, tasks.projectId),
    eq(taskVersions.datasetId, tasks.datasetId),
    eq(taskVersions.taskId, tasks.id)
  );
  const latest = db
    .select({ hash: taskVersions.hash, createdAt: taskVersions.createdAt })
    .from(taskVersions)
    .where(ofTask)
    .orderBy(desc(taskVersions.createdAt), desc(taskVersions.hash))
    .limit(1)
    .as("latest");

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        name: tasks.id,
        hash: latest.hash,
        updatedAt: latest.createdAt,
        versionCount: sql<number>`(SELECT count(*)::int FROM ${taskVersions} WHERE ${ofTask})`,
      })
      .from(tasks)
      .innerJoinLateral(latest, sql`true`)
      .where(where)
      .orderBy(...ascNameFold(tasks.id))
      .limit(pageSize)
      .offset(pageNumber * pageSize),
    db.select({ total: count() }).from(tasks).where(where),
  ]);

  return { items: rows, totalCount: total };
};

/** Every version of a task, newest first. */
export const getTaskVersions = async (input: z.input<typeof TaskSchema>): Promise<{ versions: TaskVersion[] }> => {
  const { projectId, datasetName, taskName } = TaskSchema.parse(input);
  const versions = await db
    .select({ hash: taskVersions.hash, createdAt: taskVersions.createdAt })
    .from(taskVersions)
    .where(
      and(
        eq(taskVersions.projectId, projectId),
        eq(taskVersions.datasetId, datasetName),
        eq(taskVersions.taskId, taskName)
      )
    )
    .orderBy(desc(taskVersions.createdAt), desc(taskVersions.hash));
  if (versions.length === 0) throw new NotFoundError("Task not found");
  return { versions };
};
