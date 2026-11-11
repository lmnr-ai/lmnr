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
 * Files of the evals folder a remote run (`lmnr-cli eval run --remote`) uploaded.
 * The archive is a `.tar.gz` made of one gzip member per group of files, and its
 * index (written by lmnr-cli's `pack.ts`) gives each file's member, so one file
 * is read with a ranged GET instead of the whole archive.
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

export interface EvaluationFiles {
  /** The evaluation's suite dir, relative to the archive root. */
  suitePath: string;
  files: { path: string; size: number }[];
}

// Indexes never change once uploaded.
const indexes = new SimpleLRU<string, ArchiveIndex>(16);

const archivePrefix = (projectId: string, uploadId: string) => `hosted-evals/${projectId}/${uploadId}`;

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
  const prefix = archivePrefix(projectId, hosted.data.uploadId);
  let index = indexes.get(prefix);
  if (!index) {
    const text = await readExportText(`${prefix}.index.json`);
    if (text === null) {
      // Uploaded by a CLI that predates the index, or expired.
      throw new NotFoundError("This evaluation's files are not available");
    }
    index = ArchiveIndexSchema.parse(JSON.parse(text));
    indexes.set(prefix, index);
  }
  return { suitePath: hosted.data.suitePath, archiveKey: `${prefix}.tar.gz`, index };
};

export const getEvaluationFiles = async (projectId: string, evaluationId: string): Promise<EvaluationFiles> => {
  const { suitePath, index } = await getHostedRun(projectId, evaluationId);
  return { suitePath, files: index.files.map(({ path, size }) => ({ path, size })) };
};

/** Streams one file's content out of the run's archive. */
export const readEvaluationFile = async (
  projectId: string,
  evaluationId: string,
  path: string
): Promise<{ size: number; stream: Readable }> => {
  const { archiveKey, index } = await getHostedRun(projectId, evaluationId);
  const file = index.files.find((f) => f.path === path);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  const member = await streamExportRange(archiveKey, file.offset, file.offset + file.length - 1);
  const gunzip = createGunzip();
  // Stopping early (the file ends before its member does) destroys the gunzip
  // stream, and the pipeline then aborts the S3 download.
  pipeline(member, gunzip).catch(() => {});
  return { size: file.size, stream: Readable.from(slice(gunzip, file.dataOffset, file.size)) };
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
