import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { evaluations } from "@/lib/db/migrations/schema";
import { readExportText, streamExportRange } from "@/lib/s3";
import { SimpleLRU } from "@/lib/simple-lru";

/*
 * Archives a remote run (`lmnr-cli eval run --remote`) uploads: the evals
 * folder (the Task view) and, once each suite ends, its Harbor job output (the
 * trial Log view, `<upload>/jobs/<suite>`). Each is a `.tar.gz` made of one gzip
 * member per group of files, and its index (written by lmnr-cli's `pack.ts`)
 * gives each file's member, so one file is read with a ranged GET instead of
 * the whole archive.
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

export interface EvaluationFiles {
  /** The evaluation's suite dir, relative to the archive root. */
  suitePath: string;
  files: ArchiveFile[];
}

export interface TrialLogFiles {
  /** Relative to the trial's dir in its Harbor job. */
  files: ArchiveFile[];
}

class FilesUnavailableError extends NotFoundError {
  constructor() {
    super("This evaluation's files are not available");
  }
}

class LogsUnavailableError extends NotFoundError {
  constructor() {
    super("This trial's logs aren't available yet: a remote run uploads them when its suite finishes");
  }
}

type Unavailable = new () => NotFoundError;

// Indexes never change once uploaded.
const indexes = new SimpleLRU<string, ArchiveIndex>(16);

const getHostedRun = async (projectId: string, evaluationId: string) => {
  const evaluation = await db.query.evaluations.findFirst({
    columns: { hostedMetadata: true },
    where: and(eq(evaluations.id, evaluationId), eq(evaluations.projectId, projectId)),
  });
  if (!evaluation) {
    throw new NotFoundError("Evaluation not found");
  }
  const hosted = HostedMetadataSchema.safeParse(evaluation.hostedMetadata);
  if (!hosted.success) {
    throw new NotFoundError("This evaluation has no uploaded files");
  }
  return { ...hosted.data, runPrefix: `hosted-evals/${projectId}/${hosted.data.uploadId}` };
};

/** `<prefix>.index.json`, the index of `<prefix>.tar.gz`. */
const getIndex = async (prefix: string, unavailable: Unavailable): Promise<ArchiveIndex> => {
  const cached = indexes.get(prefix);
  if (cached) {
    return cached;
  }
  const text = await readExportText(`${prefix}.index.json`);
  if (text === null) {
    // Not uploaded (an older CLI, or a suite still running), or expired.
    throw new unavailable();
  }
  const index = ArchiveIndexSchema.parse(JSON.parse(text));
  indexes.set(prefix, index);
  return index;
};

/** Streams one file's content out of `<prefix>.tar.gz`. */
const readArchiveFile = async (
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

export const getEvaluationFiles = async (projectId: string, evaluationId: string): Promise<EvaluationFiles> => {
  const { suitePath, runPrefix } = await getHostedRun(projectId, evaluationId);
  const index = await getIndex(runPrefix, FilesUnavailableError);
  return { suitePath, files: index.files.map(({ path, size }) => ({ path, size })) };
};

/** Streams one file of the run's evals folder, `path` relative to its root. */
export const readEvaluationFile = async (projectId: string, evaluationId: string, path: string) => {
  const { runPrefix } = await getHostedRun(projectId, evaluationId);
  return readArchiveFile(runPrefix, path, FilesUnavailableError);
};

const jobPrefix = (runPrefix: string, suitePath: string) => `${runPrefix}/jobs/${suitePath}`;

/** The files of one trial's dir in its suite's Harbor job (`trialName` is Harbor's trial name). */
export const getTrialLogs = async (
  projectId: string,
  evaluationId: string,
  trialName: string
): Promise<TrialLogFiles> => {
  const { runPrefix, suitePath } = await getHostedRun(projectId, evaluationId);
  const index = await getIndex(jobPrefix(runPrefix, suitePath), LogsUnavailableError);
  const dir = `${trialName}/`;
  return {
    files: index.files
      .filter((f) => f.path.startsWith(dir))
      .map(({ path, size }) => ({ path: path.slice(dir.length), size })),
  };
};

/** Streams one file of a trial's dir, `path` relative to it. */
export const readTrialLogFile = async (projectId: string, evaluationId: string, trialName: string, path: string) => {
  const { runPrefix, suitePath } = await getHostedRun(projectId, evaluationId);
  return readArchiveFile(jobPrefix(runPrefix, suitePath), `${trialName}/${path}`, LogsUnavailableError);
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
