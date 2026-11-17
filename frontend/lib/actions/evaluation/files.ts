import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import {
  type ArchiveFile,
  blobPrefix,
  FilesUnavailableError,
  jobPrefix,
  listArchive,
  readArchiveFile,
} from "@/lib/hosted-evals/archive";

/*
 * An evaluation of a run started by lmnr-cli records the hashes of the task set
 * and agent scripts it ran (`hosted_metadata`, set by the Laminar Harbor
 * plugin), so each trial's task folder and the scripts show from those blobs
 * whether or not the task set was a pushed version. A remote run's evaluation
 * also shows the trial's dir in its Harbor job output, which the orchestrator
 * uploads once the task set's `harbor run` ends.
 */

// The app-server validates these too; they become storage keys.
const name = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/);
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const HostedMetadataSchema = z.object({
  taskSet: name.optional().catch(undefined),
  taskSetHash: hash.optional().catch(undefined),
  scriptsHash: hash.optional().catch(undefined),
  runId: z.guid().optional().catch(undefined),
});

/** Which of the evaluation's archives to read. */
export type EvaluationArchive = "task-set" | "scripts";

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

const getHostedMetadata = async (projectId: string, evaluationId: string) => {
  const [row] = await db
    .select({ hostedMetadata: evaluations.hostedMetadata })
    .from(evaluations)
    .where(and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)));
  if (!row) {
    throw new NotFoundError("Evaluation not found");
  }
  const parsed = HostedMetadataSchema.safeParse(row.hostedMetadata ?? {});
  return parsed.success ? parsed.data : {};
};

const getArchivePrefix = async (projectId: string, evaluationId: string, archive: EvaluationArchive) => {
  const hosted = await getHostedMetadata(projectId, evaluationId);
  const archiveHash = archive === "task-set" ? hosted.taskSetHash : hosted.scriptsHash;
  if (!archiveHash) {
    throw new NotFoundError(
      archive === "task-set"
        ? "This evaluation didn't record its task set"
        : "This evaluation didn't record its agent scripts"
    );
  }
  return blobPrefix(projectId, archiveHash);
};

const getJobPrefix = async (projectId: string, evaluationId: string) => {
  const { runId, taskSet } = await getHostedMetadata(projectId, evaluationId);
  if (!runId || !taskSet) {
    throw new NotFoundError("Only remote runs upload trial logs");
  }
  return jobPrefix(projectId, runId, taskSet);
};

/** The files of the task set or agent scripts the evaluation ran, paths relative to their root. */
export const getEvaluationFiles = async (
  projectId: string,
  evaluationId: string,
  archive: EvaluationArchive
): Promise<EvaluationFiles> => ({
  files: await listArchive(await getArchivePrefix(projectId, evaluationId, archive), FilesUnavailableError),
});

/** Streams one file of the evaluation's task set or agent scripts, `path` relative to its root. */
export const readEvaluationFile = async (
  projectId: string,
  evaluationId: string,
  archive: EvaluationArchive,
  path: string
) => readArchiveFile(await getArchivePrefix(projectId, evaluationId, archive), path, FilesUnavailableError);

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
