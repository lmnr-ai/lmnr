import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import {
  evalAgents,
  evalAgentVersions,
  evaluations,
  taskSets,
  taskSetVersions,
  tasks,
} from "@/lib/db/migrations/schema";
import { blobPrefix } from "@/lib/hosted-evals/archive";

import {
  type AgentGroup,
  type AgentScriptsInfo,
  type TaskInfo,
  type TaskSetDetail,
  type TaskSetLink,
  type TaskSetRun,
  type TaskSetVersionWithDiff,
} from "./types";

export * from "./types";

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.name.localeCompare(b.name);

const scriptsColumns = {
  id: evalAgentVersions.id,
  hash: evalAgentVersions.hash,
  gitSha: evalAgentVersions.gitSha,
  createdAt: evalAgentVersions.createdAt,
  lastUsedAt: evalAgentVersions.lastUsedAt,
};

/** The scripts the agent's last run used: join `evalAgentVersions` on this. */
const latestScriptsId = sql`(SELECT v.id FROM ${evalAgentVersions} v WHERE v.eval_agent_id = ${evalAgents.id} ORDER BY v.last_used_at DESC LIMIT 1)`;

const toScripts = (row: { id: string | null } | null): AgentScriptsInfo | null =>
  row?.id ? (row as AgentScriptsInfo) : null;

/** Every agent of the project with its task sets, both by name. */
export const getTaskSetGroups = async (projectId: string): Promise<AgentGroup[]> => {
  const [agents, sets] = await Promise.all([
    db
      .select({ id: evalAgents.id, name: evalAgents.name, latestScripts: scriptsColumns })
      .from(evalAgents)
      .leftJoin(evalAgentVersions, eq(evalAgentVersions.id, latestScriptsId))
      .where(eq(evalAgents.projectId, projectId)),
    db
      .select({
        id: taskSets.id,
        name: taskSets.name,
        agentId: taskSets.evalAgentId,
        createdAt: taskSets.createdAt,
        headId: taskSetVersions.id,
        headNumber: taskSetVersions.number,
        headCreatedAt: taskSetVersions.createdAt,
        taskCount: sql<number>`(SELECT count(*) FROM ${tasks} WHERE ${tasks.taskSetVersionId} = ${taskSets.headVersionId})::int`,
      })
      .from(taskSets)
      .leftJoin(taskSetVersions, eq(taskSetVersions.id, taskSets.headVersionId))
      .where(eq(taskSets.projectId, projectId)),
  ]);
  return agents
    .map((agent) => ({
      id: agent.id,
      name: agent.name,
      latestScripts: toScripts(agent.latestScripts),
      taskSets: sets
        .filter((s) => s.agentId === agent.id)
        .map((s) => ({
          id: s.id,
          name: s.name,
          createdAt: s.createdAt,
          taskCount: s.taskCount,
          head: s.headId ? { id: s.headId, number: s.headNumber, createdAt: s.headCreatedAt! } : null,
        }))
        .sort(byName),
    }))
    .sort(byName);
};

const findTaskSet = async (projectId: string, taskSetId: string) => {
  const [set] = await db
    .select({
      id: taskSets.id,
      name: taskSets.name,
      headVersionId: taskSets.headVersionId,
      agent: { id: evalAgents.id, name: evalAgents.name },
      latestScripts: scriptsColumns,
    })
    .from(taskSets)
    .innerJoin(evalAgents, eq(evalAgents.id, taskSets.evalAgentId))
    .leftJoin(evalAgentVersions, eq(evalAgentVersions.id, latestScriptsId))
    .where(and(eq(taskSets.id, taskSetId), eq(taskSets.projectId, projectId)));
  if (!set) {
    throw new NotFoundError("Task set not found");
  }
  const { latestScripts, ...rest } = set;
  return { ...rest, agent: { ...set.agent, latestScripts: toScripts(latestScripts) } };
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
    .orderBy(desc(taskSetVersions.createdAt));
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

/** A recorded agent-scripts copy's archive prefix, after checking it belongs to the agent and project. */
export const getAgentVersionPrefix = async (projectId: string, agentId: string, versionId: string) => {
  const [version] = await db
    .select({ hash: evalAgentVersions.hash })
    .from(evalAgentVersions)
    .where(
      and(
        eq(evalAgentVersions.id, versionId),
        eq(evalAgentVersions.evalAgentId, agentId),
        eq(evalAgentVersions.projectId, projectId)
      )
    );
  if (!version) {
    throw new NotFoundError("Agent scripts version not found");
  }
  return blobPrefix(projectId, version.hash);
};

/** What an evaluation's header links to; null when the version is gone. */
export const getTaskSetLink = async (projectId: string, versionId: string): Promise<TaskSetLink | null> => {
  const [link] = await db
    .select({
      taskSetId: taskSets.id,
      taskSetName: taskSets.name,
      agentName: evalAgents.name,
      versionNumber: taskSetVersions.number,
    })
    .from(taskSetVersions)
    .innerJoin(taskSets, eq(taskSets.id, taskSetVersions.taskSetId))
    .innerJoin(evalAgents, eq(evalAgents.id, taskSets.evalAgentId))
    .where(and(eq(taskSetVersions.id, versionId), eq(taskSetVersions.projectId, projectId)));
  return link ?? null;
};

/** Deletes the task set's rows (its versions and tasks cascade; evaluations keep their results). */
export const deleteTaskSet = async (projectId: string, taskSetId: string) => {
  await db.delete(taskSets).where(and(eq(taskSets.id, taskSetId), eq(taskSets.projectId, projectId)));
};

/** Deletes the agent with its scripts versions and task sets. */
export const deleteEvalAgent = async (projectId: string, agentId: string) => {
  await db.delete(evalAgents).where(and(eq(evalAgents.id, agentId), eq(evalAgents.projectId, projectId)));
};

/** The agent's task set ids and names, for the audit event of its deletion. */
export const getAgentTaskSets = async (projectId: string, agentId: string) =>
  db
    .select({ id: taskSets.id, name: taskSets.name })
    .from(taskSets)
    .where(and(eq(taskSets.evalAgentId, agentId), eq(taskSets.projectId, projectId)));
