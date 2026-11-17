import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { readExportText, streamExportRange } from "@/lib/s3";
import { SimpleLRU } from "@/lib/simple-lru";

import { type ArchiveFile } from "./types";

/*
 * Archives hosted evals keep in the exports bucket: task-set and agent-script
 * versions (`eval-store/<project>/<hash>`) and each remote run's Harbor job
 * output (`hosted-evals/<project>/<runId>/jobs/<taskSet>`). Each is a `.tar.gz`
 * made of one gzip member per group of files, and its index (written by
 * lmnr-cli's `pack.ts`) gives each file's member, so one file is read with a
 * ranged GET instead of the whole archive.
 */

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

export type { ArchiveFile };

export type Unavailable = new () => NotFoundError;

export class FilesUnavailableError extends NotFoundError {
  constructor() {
    super("These files are not available");
  }
}

// Indexes never change once uploaded.
const indexes = new SimpleLRU<string, ArchiveIndex>(32);

/** `eval-store/<project>/<hash>`: a task-set or agent-scripts version's archive, without extension. */
export const blobPrefix = (projectId: string, hash: string) => `eval-store/${projectId}/${hash}`;

/** `hosted-evals/<project>/<runId>/jobs/<taskSet>`: one task set's Harbor job output from a remote run. */
export const jobPrefix = (projectId: string, runId: string, taskSet: string) =>
  `hosted-evals/${projectId}/${runId}/jobs/${taskSet}`;

/** `<prefix>.index.json`, the index of `<prefix>.tar.gz`. */
const getIndex = async (prefix: string, unavailable: Unavailable): Promise<ArchiveIndex> => {
  const cached = indexes.get(prefix);
  if (cached) {
    return cached;
  }
  const text = await readExportText(`${prefix}.index.json`);
  if (text === null) {
    throw new unavailable();
  }
  const index = ArchiveIndexSchema.parse(JSON.parse(text));
  indexes.set(prefix, index);
  return index;
};

/** Every file of `<prefix>.tar.gz`, paths relative to the archive root. */
export const listArchive = async (prefix: string, unavailable: Unavailable = FilesUnavailableError) => {
  const index = await getIndex(prefix, unavailable);
  return index.files.map(({ path, size }): ArchiveFile => ({ path, size }));
};

/** Streams one file's content out of `<prefix>.tar.gz`. */
export const readArchiveFile = async (
  prefix: string,
  path: string,
  unavailable: Unavailable = FilesUnavailableError
): Promise<{ size: number; stream: Readable }> => {
  const index = await getIndex(prefix, unavailable);
  const file = index.files.find((f) => f.path === path);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  const member = await streamExportRange(`${prefix}.tar.gz`, file.offset, file.offset + file.length - 1);
  if (!member) {
    // Deleted (or expired, for job output) while its index was still cached.
    indexes.delete(prefix);
    throw new unavailable();
  }
  const gunzip = createGunzip();
  // Stopping early (the file ends before its member does) destroys the gunzip
  // stream, and the pipeline then aborts the S3 download.
  pipeline(member, gunzip).catch(() => {});
  return { size: file.size, stream: Readable.from(slice(gunzip, file.dataOffset, file.size)) };
};

/** A streamed archive file as a download: user content is never rendered by the browser. */
export const fileResponse = ({ size, stream }: { size: number; stream: Readable }, path: string) => {
  const name = path.split("/").pop() ?? "file";
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
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
