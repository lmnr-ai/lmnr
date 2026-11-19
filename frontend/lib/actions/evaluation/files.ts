import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { findTaskVersionPrefix } from "@/lib/actions/eval-datasets/storage";
import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import { filesUnder, trimDir } from "@/lib/evaluation/trial-files";
import { readExportText, streamExportRange } from "@/lib/s3";
import { SimpleLRU } from "@/lib/simple-lru";

/*
 * The trial Files view's archives: pushed task versions
 * (`<project>/datasets/<dataset>/<task>/<hash>`, also read by the eval dataset
 * pages through `lib/actions/eval-datasets/files.ts`), and what a remote run
 * (`lmnr-cli eval run --remote`) uploads: the evals folder and, once each
 * dataset's run ends, its Harbor job output (`<upload>/jobs/<suitePath>`). Each
 * is a `.tar.gz` made of one gzip member per group of files, and its index
 * (written by lmnr-cli's `pack.ts`) gives each file's member, so one file is
 * read with a ranged GET instead of the whole archive.
 */

const HostedMetadataSchema = z.object({
  uploadId: z.guid(),
  suitePath: z.string(),
});

const ArchiveIndexSchema = z.object({
  files: z.array(
    z.object({
      path: z.string(),
      size: z.number(),
      offset: z.number(),
      length: z.number(),
      dataOffset: z.number(),
    })
  ),
});

type ArchiveIndex = z.infer<typeof ArchiveIndexSchema>;

export interface ArchiveFile {
  path: string;
  size: number;
}

/** Where a trial's `task/` root comes from. */
export type TaskFilesSource =
  | { kind: "version"; dataset: string; task: string; hash: string }
  | { kind: "upload"; path: string };

export interface TrialTaskFiles {
  source: TaskFilesSource;
  /** Relative to the task dir. */
  files: ArchiveFile[];
}

/** What the client knows about a trial's task (its datapoint's `task_id`, `task_version_hash`, `metadata.task_path`). */
export interface TrialTaskRef {
  task: string | null;
  hash: string | null;
  taskPath: string | null;
}

class FilesUnavailableError extends NotFoundError {
  constructor() {
    super("This evaluation's files are not available");
  }
}

class OutputUnavailableError extends NotFoundError {
  constructor() {
    super("This trial's logs aren't available yet: a remote run uploads them when its dataset finishes.");
  }
}

class TaskUnavailableError extends NotFoundError {
  constructor() {
    super("This trial's task files are not available");
  }
}

export type Unavailable = new () => NotFoundError;

// Indexes never change once uploaded.
const indexes = new SimpleLRU<string, ArchiveIndex>(16);

const getEvaluationRun = async (projectId: string, evaluationId: string) => {
  const evaluation = await db.query.evaluations.findFirst({
    columns: { hostedMetadata: true, datasetV2Id: true },
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });
  if (!evaluation) {
    throw new NotFoundError("Evaluation not found");
  }
  const hosted = HostedMetadataSchema.safeParse(evaluation.hostedMetadata);
  return {
    dataset: evaluation.datasetV2Id,
    hosted: hosted.success ? { ...hosted.data, runPrefix: `hosted-evals/${projectId}/${hosted.data.uploadId}` } : null,
  };
};

const getHostedRun = async (projectId: string, evaluationId: string) => {
  const { hosted } = await getEvaluationRun(projectId, evaluationId);
  if (!hosted) {
    throw new NotFoundError("This evaluation has no uploaded files");
  }
  return hosted;
};

/** `<prefix>.index.json`, the index of `<prefix>.tar.gz`. */
const getIndex = async (prefix: string, unavailable: Unavailable): Promise<ArchiveIndex> => {
  const cached = indexes.get(prefix);
  if (cached) {
    return cached;
  }
  const text = await readExportText(`${prefix}.index.json`);
  if (text === null) {
    // Not uploaded (an older CLI, or a dataset still running), or expired.
    throw new unavailable();
  }
  const index = ArchiveIndexSchema.parse(JSON.parse(text));
  indexes.set(prefix, index);
  return index;
};

/** The files in `<prefix>.tar.gz`, paths relative to its root. */
export const listArchiveFiles = async (prefix: string, unavailable: Unavailable): Promise<ArchiveFile[]> => {
  const index = await getIndex(prefix, unavailable);
  return index.files.map(({ path, size }) => ({ path, size }));
};

/** Streams one file's content out of `<prefix>.tar.gz`. */
export const readArchiveFile = async (
  prefix: string,
  path: string,
  unavailable: Unavailable
): Promise<{ size: number; stream: Readable }> => {
  const index = await getIndex(prefix, unavailable);
  const file = index.files.find((f) => f.path === path);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  const member = await streamExportRange(`${prefix}.tar.gz`, file.offset, file.offset + file.length - 1);
  if (!member) {
    // Expired (the bucket's lifecycle rule) while its index was still cached.
    indexes.delete(prefix);
    throw new unavailable();
  }
  const gunzip = createGunzip();
  // Stopping early (the file ends before its member does) destroys the gunzip
  // stream, and the pipeline then aborts the S3 download.
  pipeline(member, gunzip).catch(() => {});
  return { size: file.size, stream: Readable.from(slice(gunzip, file.dataOffset, file.size)) };
};

/** The dataset dir (`suitePath`) in the run's uploaded evals folder, with a trailing slash unless it's the root. */
const datasetDirOf = (suitePath: string) => {
  const root = trimDir(suitePath);
  return root ? `${root}/` : "";
};

/**
 * The archive and dir a trial's task is read from: the pushed task version the
 * datapoint names (`task_version_hash`) when the project has it, else the task
 * dir of the run's uploaded evals folder (`metadata.task_path`, remote runs).
 */
const resolveTask = async (projectId: string, evaluationId: string, ref: TrialTaskRef) => {
  const { dataset, hosted } = await getEvaluationRun(projectId, evaluationId);
  if (dataset && ref.task && ref.hash) {
    const prefix = await findTaskVersionPrefix({ projectId, dataset, task: ref.task, hash: ref.hash });
    if (prefix) {
      const source: TaskFilesSource = { kind: "version", dataset, task: ref.task, hash: ref.hash };
      return { prefix, dir: "", source };
    }
  }
  // Only the trial's own `<dataset>/tasks/<task>` dir, so a forged `taskPath` can't list harbor.yaml or other tasks.
  const taskDir = ref.taskPath ? trimDir(ref.taskPath) : "";
  if (hosted && ref.task && taskDir === `${datasetDirOf(hosted.suitePath)}tasks/${ref.task}`) {
    const source: TaskFilesSource = { kind: "upload", path: taskDir };
    return { prefix: hosted.runPrefix, dir: `${taskDir}/`, source };
  }
  if (dataset && ref.hash) {
    throw new NotFoundError(
      `This trial's task version isn't in the ${dataset} eval dataset: push it with \`lmnr-cli eval dataset push\`.`
    );
  }
  throw new TaskUnavailableError();
};

export const getTrialTaskFiles = async (
  projectId: string,
  evaluationId: string,
  ref: TrialTaskRef
): Promise<TrialTaskFiles> => {
  const { prefix, dir, source } = await resolveTask(projectId, evaluationId, ref);
  const files = filesUnder(await listArchiveFiles(prefix, TaskUnavailableError), dir);
  if (files.length === 0) throw new TaskUnavailableError();
  return { source, files };
};

/** Streams one file of a trial's task, `path` relative to the task dir. */
export const readTrialTaskFile = async (projectId: string, evaluationId: string, ref: TrialTaskRef, path: string) => {
  const { prefix, dir } = await resolveTask(projectId, evaluationId, ref);
  return readArchiveFile(prefix, `${dir}${path}`, TaskUnavailableError);
};

/** The dataset's `agent/` dir in the run's uploaded evals folder. */
const agentDirOf = (suitePath: string) => `${datasetDirOf(suitePath)}agent/`;

/** The run's agent dir (`<suitePath>/agent/`), paths relative to it. */
export const getRunAgentFiles = async (projectId: string, evaluationId: string): Promise<{ files: ArchiveFile[] }> => {
  const { runPrefix, suitePath } = await getHostedRun(projectId, evaluationId);
  return { files: filesUnder(await listArchiveFiles(runPrefix, FilesUnavailableError), agentDirOf(suitePath)) };
};

/** Streams one file of the run's agent dir, `path` relative to it. */
export const readRunAgentFile = async (projectId: string, evaluationId: string, path: string) => {
  const { runPrefix, suitePath } = await getHostedRun(projectId, evaluationId);
  return readArchiveFile(runPrefix, `${agentDirOf(suitePath)}${path}`, FilesUnavailableError);
};

const jobPrefix = (runPrefix: string, suitePath: string) => `${runPrefix}/jobs/${suitePath}`;

/** The files of one trial's dir in its dataset's Harbor job (`trialName` is Harbor's trial name). */
export const getTrialLogs = async (
  projectId: string,
  evaluationId: string,
  trialName: string
): Promise<{ files: ArchiveFile[] }> => {
  const { runPrefix, suitePath } = await getHostedRun(projectId, evaluationId);
  return {
    files: filesUnder(await listArchiveFiles(jobPrefix(runPrefix, suitePath), OutputUnavailableError), `${trialName}/`),
  };
};

/** Streams one file of a trial's dir, `path` relative to it. */
export const readTrialLogFile = async (projectId: string, evaluationId: string, trialName: string, path: string) => {
  const { runPrefix, suitePath } = await getHostedRun(projectId, evaluationId);
  return readArchiveFile(jobPrefix(runPrefix, suitePath), `${trialName}/${path}`, OutputUnavailableError);
};

/** `size` bytes of `source` from `start` on. */
async function* slice(source: AsyncIterable<Buffer>, start: number, size: number) {
  const end = start + size;
  let position = 0;
  for await (const chunk of source) {
    const from = Math.max(start - position, 0);
    const to = Math.min(end - position, chunk.length);
    if (to > from) {
      yield chunk.subarray(from, to);
    }
    position += chunk.length;
    if (position >= end) {
      return;
    }
  }
}
