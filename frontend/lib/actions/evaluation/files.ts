import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { evaluations, taskSets, taskSetVersions } from "@/lib/db/migrations/schema";
import {
  type ArchiveFile,
  blobPrefix,
  FilesUnavailableError,
  jobPrefix,
  listArchive,
  readArchiveFile,
} from "@/lib/hosted-evals/archive";

/*
 * An evaluation linked to a task-set version (set by the Laminar Harbor plugin)
 * shows each trial's task folder from that version's archive. A remote run's
 * evaluation also shows the trial's dir in its Harbor job output, which the
 * orchestrator uploads once the task set's `harbor run` ends.
 */

const HostedMetadataSchema = z.object({ runId: z.guid() });

export interface EvaluationFiles {
  files: ArchiveFile[];
}

export interface TrialLogFiles {
  /** Relative to the trial's dir in its Harbor job. */
  files: ArchiveFile[];
}

class LogsUnavailableError extends NotFoundError {
  constructor() {
    super("This trial's logs aren't available yet: a remote run uploads them when its task set finishes");
  }
}

const getLinkedTaskSet = async (projectId: string, evaluationId: string) => {
  const [row] = await db
    .select({
      hostedMetadata: evaluations.hostedMetadata,
      hash: taskSetVersions.hash,
      taskSetName: taskSets.name,
    })
    .from(evaluations)
    .innerJoin(taskSetVersions, eq(taskSetVersions.id, evaluations.taskSetVersionId))
    .innerJoin(taskSets, eq(taskSets.id, taskSetVersions.taskSetId))
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)));
  if (!row) {
    throw new NotFoundError("This evaluation isn't linked to a task set");
  }
  return row;
};

const getJobPrefix = async (projectId: string, evaluationId: string) => {
  const { hostedMetadata, taskSetName } = await getLinkedTaskSet(projectId, evaluationId);
  const hosted = HostedMetadataSchema.safeParse(hostedMetadata);
  if (!hosted.success) {
    throw new NotFoundError("Only remote runs upload trial logs");
  }
  return jobPrefix(projectId, hosted.data.runId, taskSetName);
};

/** The files of the evaluation's task-set version, paths relative to the task set's root. */
export const getEvaluationFiles = async (projectId: string, evaluationId: string): Promise<EvaluationFiles> => {
  const { hash } = await getLinkedTaskSet(projectId, evaluationId);
  return { files: await listArchive(blobPrefix(projectId, hash), FilesUnavailableError) };
};

/** Streams one file of the evaluation's task-set version, `path` relative to its root. */
export const readEvaluationFile = async (projectId: string, evaluationId: string, path: string) => {
  const { hash } = await getLinkedTaskSet(projectId, evaluationId);
  return readArchiveFile(blobPrefix(projectId, hash), path, FilesUnavailableError);
};

/** The files of one trial's dir in its task set's Harbor job (`trialName` is Harbor's trial name). */
export const getTrialLogs = async (
  projectId: string,
  evaluationId: string,
  trialName: string
): Promise<TrialLogFiles> => {
  const files = await listArchive(await getJobPrefix(projectId, evaluationId), LogsUnavailableError);
  const dir = `${trialName}/`;
  return {
    files: files
      .filter((f) => f.path.startsWith(dir))
      .map(({ path, size }) => ({ path: path.slice(dir.length), size })),
  };
};

/** Streams one file of a trial's dir, `path` relative to it. */
export const readTrialLogFile = async (projectId: string, evaluationId: string, trialName: string, path: string) =>
  readArchiveFile(await getJobPrefix(projectId, evaluationId), `${trialName}/${path}`, LogsUnavailableError);
