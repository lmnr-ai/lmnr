import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/drizzle";
import { taskVersions } from "@/lib/db/migrations/schema";

import { isDatasetName, isTaskHash, isTaskName } from "./types";

export interface TaskVersionRef {
  projectId: string;
  dataset: string;
  task: string;
  hash: string;
}

/**
 * The storage prefix of a pushed task version (`<prefix>.tar.gz` + `.index.json`,
 * paths relative to the task dir), or null unless the project has the version.
 * Its row is written only once both objects are uploaded, and the names are
 * checked first because they go into the key.
 */
export const findTaskVersionPrefix = async ({ projectId, dataset, task, hash }: TaskVersionRef) => {
  if (!isDatasetName(dataset) || !isTaskName(task) || !isTaskHash(hash)) return null;
  const row = await db.query.taskVersions.findFirst({
    columns: { hash: true },
    where: and(
      eq(taskVersions.projectId, projectId),
      eq(taskVersions.datasetId, dataset),
      eq(taskVersions.taskId, task),
      eq(taskVersions.hash, hash)
    ),
  });
  return row ? `${projectId}/datasets/${dataset}/${task}/${hash}` : null;
};
