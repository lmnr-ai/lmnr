import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { parseFilters } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema } from "@/lib/actions/common/types";
import { getArchiveIndex, readArchiveFile } from "@/lib/actions/evaluation/files";
import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { datasetsV2, tasks, taskVersions } from "@/lib/db/migrations/schema";
import { ascNameFold } from "@/lib/db/utils";
import {
  type ArchiveFile,
  type ArchiveRef,
  isEvalName,
  TASK_HASH_RE,
  taskVersionPrefix,
} from "@/lib/evaluation/trial-files";
import { datasetsBucket } from "@/lib/s3";
import { type PaginatedResponse } from "@/lib/types";

import { type EvalDataset, type EvalDatasetSummary, type EvalTaskSummary, type EvalTaskVersion } from "./types";

export * from "./types";

// Timestamps come back as Postgres text (`2026-01-02 03:04:05.678+00`); ISO parses everywhere.
const toIso = (value: string | Date): string => new Date(value).toISOString();

export const evalListParamsSchema = PaginationFiltersSchema.extend({
  search: z.string().nullable().optional(),
});

export const getEvalDatasets = async (
  projectId: string,
  { pageNumber, pageSize, filter, search }: z.infer<typeof evalListParamsSchema>
): Promise<PaginatedResponse<EvalDatasetSummary>> => {
  const summary = db
    .select({
      id: datasetsV2.id,
      createdAt: datasetsV2.createdAt,
      taskCount: sql<number>`count(distinct ${tasks.id})::int`.as("task_count"),
      lastPushedAt: sql<string | null>`max(${taskVersions.createdAt})`.as("last_pushed_at"),
    })
    .from(datasetsV2)
    .leftJoin(tasks, and(eq(tasks.projectId, datasetsV2.projectId), eq(tasks.datasetId, datasetsV2.id)))
    .leftJoin(
      taskVersions,
      and(
        eq(taskVersions.projectId, tasks.projectId),
        eq(taskVersions.datasetId, tasks.datasetId),
        eq(taskVersions.taskId, tasks.id)
      )
    )
    .where(eq(datasetsV2.projectId, projectId))
    .groupBy(datasetsV2.id, datasetsV2.createdAt)
    .as("summary");

  const where = and(
    search ? ilike(summary.id, `%${search}%`) : undefined,
    ...parseFilters(filter, {
      name: { type: "string", column: summary.id },
      taskCount: { type: "number", column: summary.taskCount },
    } as const)
  );
  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(summary)
      .where(where)
      .orderBy(...ascNameFold(summary.id))
      .limit(pageSize)
      .offset(pageNumber * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(summary)
      .where(where),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: toIso(row.createdAt),
      taskCount: row.taskCount,
      lastPushedAt: row.lastPushedAt ? toIso(row.lastPushedAt) : null,
    })),
    totalCount: count,
  };
};

/** The dataset and its task count; null when the project has no such dataset. */
export const getEvalDataset = async (projectId: string, datasetId: string): Promise<EvalDataset | null> => {
  if (!isEvalName(datasetId)) return null;
  const [[dataset], taskCount] = await Promise.all([
    db
      .select({ id: datasetsV2.id, createdAt: datasetsV2.createdAt })
      .from(datasetsV2)
      .where(and(eq(datasetsV2.projectId, projectId), eq(datasetsV2.id, datasetId))),
    db.$count(tasks, and(eq(tasks.projectId, projectId), eq(tasks.datasetId, datasetId))),
  ]);
  return dataset ? { ...dataset, createdAt: toIso(dataset.createdAt), taskCount } : null;
};

/** One page of the dataset's tasks. */
export const getEvalDatasetTasks = async (
  projectId: string,
  datasetId: string,
  { pageNumber, pageSize, filter, search }: z.infer<typeof evalListParamsSchema>
): Promise<PaginatedResponse<EvalTaskSummary>> => {
  if (!isEvalName(datasetId)) throw new NotFoundError("Eval dataset not found");
  const summary = db
    .select({
      id: taskVersions.taskId,
      versionCount: sql<number>`count(*)::int`.as("version_count"),
      createdAt: sql<string>`min(${taskVersions.createdAt})`.as("first_pushed_at"),
      lastPushedAt: sql<string>`max(${taskVersions.createdAt})`.as("last_pushed_at"),
    })
    .from(taskVersions)
    .where(and(eq(taskVersions.projectId, projectId), eq(taskVersions.datasetId, datasetId)))
    .groupBy(taskVersions.taskId)
    .as("summary");

  const where = and(
    search ? ilike(summary.id, `%${search}%`) : undefined,
    ...parseFilters(filter, { task: { type: "string", column: summary.id } } as const)
  );
  const [rows, [{ count }]] = await Promise.all([
    db
      .select()
      .from(summary)
      .where(where)
      .orderBy(...ascNameFold(summary.id))
      .limit(pageSize)
      .offset(pageNumber * pageSize),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(summary)
      .where(where),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id,
      versionCount: row.versionCount,
      lastPushedAt: toIso(row.lastPushedAt),
      createdAt: toIso(row.createdAt),
    })),
    totalCount: count,
  };
};

/** Every version of one task, newest first. */
export const getEvalTaskVersions = async (
  projectId: string,
  datasetId: string,
  taskId: string
): Promise<EvalTaskVersion[]> => {
  if (!isEvalName(datasetId) || !isEvalName(taskId)) throw new NotFoundError("Task not found");
  const rows = await db
    .select({ hash: taskVersions.hash, pushedAt: taskVersions.createdAt })
    .from(taskVersions)
    .where(
      and(eq(taskVersions.projectId, projectId), eq(taskVersions.datasetId, datasetId), eq(taskVersions.taskId, taskId))
    )
    .orderBy(desc(taskVersions.createdAt), desc(taskVersions.hash));
  if (rows.length === 0) throw new NotFoundError("Task not found");
  return rows.map((row) => ({ hash: row.hash, pushedAt: toIso(row.pushedAt) }));
};

/** The archive of a pushed task version, which must have a `task_versions` row in the project. */
const getVersionArchive = async (
  projectId: string,
  datasetId: string,
  taskId: string,
  hash: string
): Promise<ArchiveRef> => {
  if (!isEvalName(datasetId) || !isEvalName(taskId) || !TASK_HASH_RE.test(hash)) {
    throw new NotFoundError("Task version not found");
  }
  const version = await db.query.taskVersions.findFirst({
    columns: { hash: true },
    where: and(
      eq(taskVersions.projectId, projectId),
      eq(taskVersions.datasetId, datasetId),
      eq(taskVersions.taskId, taskId),
      eq(taskVersions.hash, hash)
    ),
  });
  if (!version) {
    throw new NotFoundError("Task version not found");
  }
  const bucket = datasetsBucket();
  if (!bucket) {
    throw new NotFoundError("This task version's files are not available");
  }
  return { bucket, prefix: taskVersionPrefix(projectId, datasetId, taskId, hash) };
};

export const getTaskVersionFiles = async (
  projectId: string,
  datasetId: string,
  taskId: string,
  hash: string
): Promise<{ files: ArchiveFile[] }> => {
  const index = await getArchiveIndex(await getVersionArchive(projectId, datasetId, taskId, hash));
  if (!index) {
    throw new NotFoundError("This task version's files are not available");
  }
  return { files: index.files.map(({ path, size }) => ({ path, size })) };
};

/** Streams one file of a pushed task version, `path` relative to the task dir. */
export const readTaskVersionFile = async (
  projectId: string,
  datasetId: string,
  taskId: string,
  hash: string,
  path: string
) => readArchiveFile(await getVersionArchive(projectId, datasetId, taskId, hash), path);
