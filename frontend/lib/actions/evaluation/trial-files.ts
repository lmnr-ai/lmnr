import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { getArchiveIndex, readArchiveFile } from "@/lib/actions/evaluation/files";
import { NotFoundError } from "@/lib/api/errors";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { evaluations, taskVersions } from "@/lib/db/migrations/schema";
import {
  type ArchiveDir,
  isEvalName,
  joinArchivePath,
  listTrialFiles,
  resolveTrialPath,
  TASK_HASH_RE,
  type TrialFiles,
  type TrialFileSources,
  type TrialTaskSource,
  taskVersionPrefix,
} from "@/lib/evaluation/trial-files";

/*
 * A trial's Files panel. Everything is resolved from the trial's own rows (its
 * evaluation in Postgres, its datapoint in ClickHouse), never from the request:
 * the client only names the trial and a tree path inside its listing.
 */

const HostedMetadataSchema = z.object({
  uploadId: z.guid(),
  suitePath: z.string(),
});

const metadataString = (metadata: unknown, key: string): string | null => {
  const value = (metadata as Record<string, unknown> | null)?.[key];
  return typeof value === "string" && value ? value : null;
};

const TrialIdsSchema = z.object({ evaluationId: z.guid(), trialId: z.guid() });

const getTrial = async (projectId: string, evaluationIdParam: string, trialIdParam: string) => {
  const { evaluationId, trialId } = TrialIdsSchema.parse({ evaluationId: evaluationIdParam, trialId: trialIdParam });
  const evaluation = await db.query.evaluations.findFirst({
    columns: { hostedMetadata: true, datasetV2Id: true },
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });
  if (!evaluation) {
    throw new NotFoundError("Evaluation not found");
  }
  const result = await clickhouseClient.query({
    // A trial's versions are its rows (ReplacingMergeTree); the hash is the last non-empty one.
    query: `SELECT argMax(metadata, updated_at) AS metadata,
        argMaxIf(task_version_hash, updated_at, task_version_hash != '') AS task_version_hash
      FROM evaluation_datapoints
      WHERE project_id = {projectId: UUID} AND evaluation_id = {evaluationId: UUID} AND id = {trialId: UUID}
      GROUP BY id`,
    query_params: { projectId, evaluationId, trialId },
    format: "JSONEachRow",
  });
  const [row] = await result.json<{ metadata: string; task_version_hash: string }>();
  if (!row) {
    throw new NotFoundError("Trial not found");
  }
  let metadata: unknown = null;
  try {
    metadata = JSON.parse(row.metadata);
  } catch {
    // Unparseable metadata names no task path, dataset task or trial dir.
  }
  const hosted = HostedMetadataSchema.safeParse(evaluation.hostedMetadata);
  return {
    hosted: hosted.success ? hosted.data : null,
    dataset: evaluation.datasetV2Id,
    datasetTask: metadataString(metadata, "dataset_task"),
    hash: row.task_version_hash,
    taskPath: metadataString(metadata, "task_path"),
    trialName: metadataString(metadata, "trial_name"),
  };
};

type Trial = Awaited<ReturnType<typeof getTrial>>;

/** The trial's pushed task version, if Laminar has it. */
const getTaskVersion = async (projectId: string, trial: Trial) => {
  const { dataset, datasetTask: task, hash } = trial;
  if (!dataset || !task || !isEvalName(dataset) || !isEvalName(task) || !TASK_HASH_RE.test(hash)) {
    return null;
  }
  const version = await db.query.taskVersions.findFirst({
    columns: { createdAt: true },
    where: and(
      eq(taskVersions.projectId, projectId),
      eq(taskVersions.datasetId, dataset),
      eq(taskVersions.taskId, task),
      eq(taskVersions.hash, hash)
    ),
  });
  if (!version) return null;
  const prefix = taskVersionPrefix(projectId, dataset, task, hash);
  const index = await getArchiveIndex(prefix);
  if (!index) return null;
  const source: TrialTaskSource = { source: "dataset", dataset, task, hash, pushedAt: version.createdAt };
  return { source, dir: { prefix, dir: "", files: index.files } satisfies ArchiveDir };
};

const resolveSources = async (projectId: string, trial: Trial) => {
  const { hosted } = trial;
  const runPrefix = hosted ? `hosted-evals/${projectId}/${hosted.uploadId}` : null;
  const jobPrefix = hosted ? `${runPrefix}/jobs/${hosted.suitePath}` : null;
  const [version, upload, job] = await Promise.all([
    getTaskVersion(projectId, trial),
    runPrefix ? getArchiveIndex(runPrefix) : null,
    jobPrefix && trial.trialName ? getArchiveIndex(jobPrefix) : null,
  ]);

  const sources: TrialFileSources = {};
  let task: TrialTaskSource | null = null;
  if (version) {
    sources.task = version.dir;
    task = version.source;
  } else if (runPrefix && upload && trial.taskPath) {
    sources.task = { prefix: runPrefix, dir: joinArchivePath(trial.taskPath), files: upload.files };
    task = { source: "upload", path: trial.taskPath };
  }
  if (runPrefix && upload && hosted) {
    // Only the dataset's `agent/`: the rest of its dir (harbor.yaml, tasks/) is run config.
    sources.agent = { prefix: runPrefix, dir: joinArchivePath(hosted.suitePath, "agent"), files: upload.files };
  }
  if (jobPrefix && job && trial.trialName) {
    sources.logs = { prefix: jobPrefix, dir: joinArchivePath(trial.trialName), files: job.files };
  }
  return { sources, task, logsPending: !!jobPrefix && !!trial.trialName && !job };
};

export const getTrialFiles = async (projectId: string, evaluationId: string, trialId: string): Promise<TrialFiles> => {
  const trial = await getTrial(projectId, evaluationId, trialId);
  const { sources, task, logsPending } = await resolveSources(projectId, trial);
  const files = listTrialFiles(sources);
  // A task source whose dir has no files (e.g. a task_path missing from the upload) isn't shown.
  const hasTask = files.some((f) => f.path.startsWith("task/"));
  return { trialId, files, task: hasTask ? task : null, logsPending };
};

/** Streams one file of the trial's listing, `path` a tree path (`task/…`, `agent/…`, `logs/…`). */
export const readTrialFile = async (projectId: string, evaluationId: string, trialId: string, path: string) => {
  const trial = await getTrial(projectId, evaluationId, trialId);
  const { sources } = await resolveSources(projectId, trial);
  const resolved = resolveTrialPath(sources, path);
  if (!resolved) {
    throw new NotFoundError("File not found");
  }
  return readArchiveFile(resolved.prefix, resolved.path);
};
