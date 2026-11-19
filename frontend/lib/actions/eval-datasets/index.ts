import { and, countDistinct, desc, eq, max } from "drizzle-orm";

import { getArchiveIndex, readArchiveFile } from "@/lib/actions/evaluation/files";
import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { datasetsV2, tasks, taskVersions } from "@/lib/db/migrations/schema";
import { ascNameFold } from "@/lib/db/utils";
import {
  type ArchiveFile,
  isDatasetName,
  isTaskName,
  TASK_HASH_RE,
  taskVersionPrefix,
} from "@/lib/evaluation/trial-files";

import { type EvalDataset, type EvalDatasetSummary, groupTaskVersions } from "./types";

export * from "./types";

// Timestamps come back as Postgres text (`2026-01-02 03:04:05.678+00`); ISO parses everywhere.
const toIso = (value: string | Date): string => new Date(value).toISOString();

export const getEvalDatasets = async (projectId: string): Promise<EvalDatasetSummary[]> => {
  const rows = await db
    .select({
      id: datasetsV2.id,
      taskCount: countDistinct(tasks.id),
      lastPushedAt: max(taskVersions.createdAt),
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
    .groupBy(datasetsV2.id)
    .orderBy(...ascNameFold(datasetsV2.id));
  return rows.map((row) => ({
    id: row.id,
    taskCount: Number(row.taskCount),
    lastPushedAt: row.lastPushedAt ? toIso(row.lastPushedAt) : null,
  }));
};

/** The dataset with every version of each task; null when the project has no such dataset. */
export const getEvalDataset = async (projectId: string, datasetId: string): Promise<EvalDataset | null> => {
  if (!isDatasetName(datasetId)) return null;
  const dataset = await db.query.datasetsV2.findFirst({
    columns: { id: true, createdAt: true },
    where: and(eq(datasetsV2.projectId, projectId), eq(datasetsV2.id, datasetId)),
  });
  if (!dataset) return null;
  const rows = await db
    .select({ taskId: taskVersions.taskId, hash: taskVersions.hash, pushedAt: taskVersions.createdAt })
    .from(taskVersions)
    .where(and(eq(taskVersions.projectId, projectId), eq(taskVersions.datasetId, datasetId)))
    .orderBy(...ascNameFold(taskVersions.taskId), desc(taskVersions.createdAt), desc(taskVersions.hash));
  return {
    id: dataset.id,
    createdAt: toIso(dataset.createdAt),
    tasks: groupTaskVersions(rows.map((row) => ({ ...row, pushedAt: toIso(row.pushedAt) }))),
  };
};

/** The archive of a pushed task version, which must have a `task_versions` row in the project. */
const getVersionPrefix = async (projectId: string, datasetId: string, taskId: string, hash: string) => {
  if (!isDatasetName(datasetId) || !isTaskName(taskId) || !TASK_HASH_RE.test(hash)) {
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
  return taskVersionPrefix(projectId, datasetId, taskId, hash);
};

export const getTaskVersionFiles = async (
  projectId: string,
  datasetId: string,
  taskId: string,
  hash: string
): Promise<{ files: ArchiveFile[] }> => {
  const index = await getArchiveIndex(await getVersionPrefix(projectId, datasetId, taskId, hash));
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
) => readArchiveFile(await getVersionPrefix(projectId, datasetId, taskId, hash), path);
