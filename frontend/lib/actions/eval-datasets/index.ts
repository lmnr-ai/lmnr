import { and, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import {
  evalDatasets,
  evalDatasetVersions,
  evalDatasetVersionTasks,
  evaluations,
  users,
} from "@/lib/db/migrations/schema";
import { ascNameFold } from "@/lib/db/utils";
import { type PaginatedResponse } from "@/lib/types";

import {
  type EvalDatasetListItem,
  type EvalDatasetVersionDetails,
  type EvalDatasetVersionItem,
  evaluationGroupOf,
} from "./types";

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

const taskCount = (versionId: typeof evalDatasetVersions.id) =>
  sql<number>`(SELECT count(*)::int FROM ${evalDatasetVersionTasks} WHERE ${evalDatasetVersionTasks.versionId} = ${versionId})`;

export const getEvalDatasets = async (
  input: z.input<typeof PageSchema>
): Promise<PaginatedResponse<EvalDatasetListItem>> => {
  const { projectId, pageNumber, pageSize } = PageSchema.parse(input);

  const latest = db
    .select({
      datasetId: evalDatasetVersions.datasetId,
      version: max(evalDatasetVersions.version).as("latest_version"),
    })
    .from(evalDatasetVersions)
    .innerJoin(evalDatasets, eq(evalDatasets.id, evalDatasetVersions.datasetId))
    .where(eq(evalDatasets.projectId, projectId))
    .groupBy(evalDatasetVersions.datasetId)
    .as("latest");

  const [items, [{ total }]] = await Promise.all([
    db
      .select({
        id: evalDatasets.id,
        name: evalDatasets.name,
        createdAt: evalDatasets.createdAt,
        latestVersion: evalDatasetVersions.version,
        taskCount: taskCount(evalDatasetVersions.id),
        updatedAt: sql<string>`coalesce(${evalDatasetVersions.createdAt}, ${evalDatasets.createdAt})`,
      })
      .from(evalDatasets)
      .leftJoin(latest, eq(latest.datasetId, evalDatasets.id))
      .leftJoin(
        evalDatasetVersions,
        and(eq(evalDatasetVersions.datasetId, evalDatasets.id), eq(evalDatasetVersions.version, latest.version))
      )
      .where(eq(evalDatasets.projectId, projectId))
      .orderBy(...ascNameFold(evalDatasets.name))
      .limit(pageSize)
      .offset(pageNumber * pageSize),
    db.select({ total: count() }).from(evalDatasets).where(eq(evalDatasets.projectId, projectId)),
  ]);

  return {
    items: items.map((item) => ({ ...item, taskCount: item.latestVersion === null ? null : item.taskCount })),
    totalCount: total,
  };
};

/** The project's dataset with this name, or null. */
export const getEvalDataset = async (input: z.input<typeof DatasetSchema>) => {
  const { projectId, datasetName } = DatasetSchema.parse(input);
  const dataset = await db.query.evalDatasets.findFirst({
    columns: { id: true, name: true, createdAt: true },
    where: and(eq(evalDatasets.projectId, projectId), eq(evalDatasets.name, datasetName)),
  });
  return dataset ?? null;
};

const requireDataset = async (input: z.input<typeof DatasetSchema>) => {
  const dataset = await getEvalDataset(input);
  if (!dataset) throw new NotFoundError("Eval dataset not found");
  return dataset;
};

/** Evaluation count per group name, for the given groups of the project. */
const runCounts = async (projectId: string, groups: string[]): Promise<Map<string, number>> => {
  if (groups.length === 0) return new Map();
  const rows = await db
    .select({ groupId: evaluations.groupId, runs: count() })
    .from(evaluations)
    .where(and(eq(evaluations.projectId, projectId), inArray(evaluations.groupId, groups)))
    .groupBy(evaluations.groupId);
  return new Map(rows.map((row) => [row.groupId, row.runs]));
};

const versionColumns = {
  id: evalDatasetVersions.id,
  version: evalDatasetVersions.version,
  parentVersion: evalDatasetVersions.parentVersion,
  message: evalDatasetVersions.message,
  createdAt: evalDatasetVersions.createdAt,
  authorName: users.name,
  authorEmail: users.email,
};

export const getEvalDatasetVersions = async (
  input: z.input<typeof PageSchema> & z.input<typeof DatasetSchema>
): Promise<PaginatedResponse<EvalDatasetVersionItem>> => {
  const { projectId, pageNumber, pageSize } = PageSchema.parse(input);
  const dataset = await requireDataset(input);

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({ ...versionColumns, taskCount: taskCount(evalDatasetVersions.id) })
      .from(evalDatasetVersions)
      .leftJoin(users, eq(users.id, evalDatasetVersions.createdByUserId))
      .where(eq(evalDatasetVersions.datasetId, dataset.id))
      .orderBy(desc(evalDatasetVersions.version))
      .limit(pageSize)
      .offset(pageNumber * pageSize),
    db.select({ total: count() }).from(evalDatasetVersions).where(eq(evalDatasetVersions.datasetId, dataset.id)),
  ]);

  const runs = await runCounts(
    projectId,
    rows.map((row) => evaluationGroupOf(dataset.name, row.version))
  );
  return {
    items: rows.map((row) => ({ ...row, runCount: runs.get(evaluationGroupOf(dataset.name, row.version)) ?? 0 })),
    totalCount: total,
  };
};

const VersionSchema = DatasetSchema.extend({ version: z.coerce.number().int().min(1) });

/** One version with all its tasks (sorted by name) and the dataset's other version numbers. */
export const getEvalDatasetVersion = async (
  input: z.input<typeof VersionSchema>
): Promise<EvalDatasetVersionDetails> => {
  const { projectId, version } = VersionSchema.parse(input);
  const dataset = await requireDataset(input);

  const [row] = await db
    .select(versionColumns)
    .from(evalDatasetVersions)
    .leftJoin(users, eq(users.id, evalDatasetVersions.createdByUserId))
    .where(and(eq(evalDatasetVersions.datasetId, dataset.id), eq(evalDatasetVersions.version, version)));
  if (!row) throw new NotFoundError(`${dataset.name} has no version ${version}`);

  const [tasks, versions, runs] = await Promise.all([
    db
      .select({ name: evalDatasetVersionTasks.name, hash: evalDatasetVersionTasks.hash })
      .from(evalDatasetVersionTasks)
      .where(eq(evalDatasetVersionTasks.versionId, row.id)),
    db
      .select({ version: evalDatasetVersions.version })
      .from(evalDatasetVersions)
      .where(eq(evalDatasetVersions.datasetId, dataset.id))
      .orderBy(desc(evalDatasetVersions.version)),
    runCounts(projectId, [evaluationGroupOf(dataset.name, version)]),
  ]);

  return {
    ...row,
    dataset: dataset.name,
    // Byte order, like the lockfile; the database collation may not be.
    tasks: tasks.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
    versions: versions.map((v) => v.version),
    runCount: runs.get(evaluationGroupOf(dataset.name, version)) ?? 0,
  };
};
