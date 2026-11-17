import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { evaluations, taskSets, taskSetVersions, tasks } from "@/lib/db/migrations/schema";
import { blobPrefix } from "@/lib/hosted-evals/archive";

import {
  type TaskInfo,
  type TaskSetDetail,
  type TaskSetLink,
  type TaskSetRun,
  type TaskSetSummary,
  type TaskSetVersionWithDiff,
} from "./types";

export * from "./types";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name);

/** Every task set of the project, by name. */
export const getTaskSets = async (projectId: string): Promise<TaskSetSummary[]> => {
  const sets = await db
    .select({
      id: taskSets.id,
      name: taskSets.name,
      createdAt: taskSets.createdAt,
      headId: taskSetVersions.id,
      headNumber: taskSetVersions.number,
      headCreatedAt: taskSetVersions.createdAt,
      taskCount: sql<number>`(SELECT count(*) FROM ${tasks} WHERE ${tasks.taskSetVersionId} = ${taskSets.headVersionId})::int`,
      lastRunAt: sql<
        string | null
      >`(SELECT max(e.created_at) FROM ${evaluations} e JOIN ${taskSetVersions} v ON v.id = e.task_set_version_id WHERE v.task_set_id = ${taskSets.id})`,
    })
    .from(taskSets)
    .leftJoin(taskSetVersions, eq(taskSetVersions.id, taskSets.headVersionId))
    .where(eq(taskSets.projectId, projectId));
  return sets
    .map((s) => ({
      id: s.id,
      name: s.name,
      createdAt: s.createdAt,
      taskCount: s.taskCount,
      lastRunAt: s.lastRunAt,
      head:
        s.headId && s.headNumber !== null ? { id: s.headId, number: s.headNumber, createdAt: s.headCreatedAt! } : null,
    }))
    .sort(byName);
};

const findTaskSet = async (projectId: string, taskSetId: string) => {
  const [set] = await db
    .select({
      id: taskSets.id,
      name: taskSets.name,
      headVersionId: taskSets.headVersionId,
    })
    .from(taskSets)
    .where(and(eq(taskSets.id, taskSetId), eq(taskSets.projectId, projectId)));
  if (!set) {
    throw new NotFoundError("Task set not found");
  }
  return set;
};

/** The task set with every version (newest first) and what each changed against its parent. */
export const getTaskSet = async (projectId: string, taskSetId: string): Promise<TaskSetDetail> => {
  const set = await findTaskSet(projectId, taskSetId);
  const versions = await db
    .select({
      id: taskSetVersions.id,
      number: taskSetVersions.number,
      hash: taskSetVersions.hash,
      parentId: taskSetVersions.parentId,
      createdAt: taskSetVersions.createdAt,
    })
    .from(taskSetVersions)
    .where(eq(taskSetVersions.taskSetId, taskSetId))
    .orderBy(desc(taskSetVersions.number));
  const rows =
    versions.length === 0
      ? []
      : await db
          .select({ versionId: tasks.taskSetVersionId, name: tasks.name, digest: tasks.digest })
          .from(tasks)
          .where(
            inArray(
              tasks.taskSetVersionId,
              versions.map((v) => v.id)
            )
          );
  const digests = new Map<string, Map<string, string>>(versions.map((v) => [v.id, new Map()]));
  for (const row of rows) {
    digests.get(row.versionId)?.set(row.name, row.digest);
  }
  return { ...set, versions: versions.map((v) => withDiff(v, digests)) };
};

const withDiff = (
  version: Omit<TaskSetVersionWithDiff, "taskCount" | "added" | "removed" | "changed">,
  digests: Map<string, Map<string, string>>
): TaskSetVersionWithDiff => {
  const own = digests.get(version.id) ?? new Map<string, string>();
  const parent = (version.parentId && digests.get(version.parentId)) || new Map<string, string>();
  let added = 0;
  let changed = 0;
  for (const [name, digest] of own) {
    const before = parent.get(name);
    if (before === undefined) added += 1;
    else if (before !== digest) changed += 1;
  }
  const removed = [...parent.keys()].filter((name) => !own.has(name)).length;
  return { ...version, taskCount: own.size, added, removed, changed };
};

/** The version's archive prefix, after checking it belongs to the task set and project. */
export const getTaskSetVersionPrefix = async (projectId: string, taskSetId: string, versionId: string) => {
  const [version] = await db
    .select({ hash: taskSetVersions.hash })
    .from(taskSetVersions)
    .where(
      and(
        eq(taskSetVersions.id, versionId),
        eq(taskSetVersions.taskSetId, taskSetId),
        eq(taskSetVersions.projectId, projectId)
      )
    );
  if (!version) {
    throw new NotFoundError("Task set version not found");
  }
  return blobPrefix(projectId, version.hash);
};

export const getVersionTasks = async (projectId: string, taskSetId: string, versionId: string): Promise<TaskInfo[]> => {
  await getTaskSetVersionPrefix(projectId, taskSetId, versionId);
  const rows = await db
    .select({ id: tasks.id, name: tasks.name, digest: tasks.digest, metadata: tasks.metadata })
    .from(tasks)
    .where(eq(tasks.taskSetVersionId, versionId));
  return rows
    .map((row) => ({ ...row, metadata: (row.metadata as Record<string, unknown> | null) ?? null }))
    .sort(byName);
};

/** The evaluations that ran any version of the task set, newest first. */
export const getTaskSetRuns = async (projectId: string, taskSetId: string): Promise<TaskSetRun[]> => {
  await findTaskSet(projectId, taskSetId);
  return db
    .select({
      id: evaluations.id,
      name: evaluations.name,
      groupId: evaluations.groupId,
      createdAt: evaluations.createdAt,
      versionId: taskSetVersions.id,
      versionNumber: taskSetVersions.number,
    })
    .from(evaluations)
    .innerJoin(taskSetVersions, eq(taskSetVersions.id, evaluations.taskSetVersionId))
    .where(and(eq(taskSetVersions.taskSetId, taskSetId), eq(evaluations.projectId, projectId)))
    .orderBy(desc(evaluations.createdAt))
    .limit(500);
};

/** What an evaluation's header links to; null when the version is gone. */
export const getTaskSetLink = async (projectId: string, versionId: string): Promise<TaskSetLink | null> => {
  const [link] = await db
    .select({
      taskSetId: taskSets.id,
      taskSetName: taskSets.name,
      versionNumber: taskSetVersions.number,
    })
    .from(taskSetVersions)
    .innerJoin(taskSets, eq(taskSets.id, taskSetVersions.taskSetId))
    .where(and(eq(taskSetVersions.id, versionId), eq(taskSetVersions.projectId, projectId)));
  return link ?? null;
};

/** Deletes the task set's rows (its versions and tasks cascade; evaluations keep their results). */
export const deleteTaskSet = async (projectId: string, taskSetId: string) => {
  await db.delete(taskSets).where(and(eq(taskSets.id, taskSetId), eq(taskSets.projectId, projectId)));
};
