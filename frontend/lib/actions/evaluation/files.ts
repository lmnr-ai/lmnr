import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { type ArchiveRef } from "@/lib/evaluation/trial-files";
import { readObjectText, streamObjectRange } from "@/lib/s3";
import { SimpleLRU } from "@/lib/simple-lru";

/*
 * Archives in S3: what a remote run (`lmnr-cli eval run --remote`) uploads to
 * the hosted-evals bucket (the evals folder, and each dataset's Harbor job
 * output at `<upload>/jobs/<suite>`), and pushed task versions in the datasets
 * bucket.
 * Each is a `.tar.gz` made of one gzip member per group of files, and its index
 * (written by lmnr-cli's `pack.ts`) gives each file's member, so one file is
 * read with a ranged GET instead of the whole archive.
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

export type ArchiveIndex = z.infer<typeof ArchiveIndexSchema>;

// Indexes never change once uploaded.
const indexes = new SimpleLRU<string, ArchiveIndex>(64);

const cacheKey = ({ bucket, prefix }: ArchiveRef) => `${bucket}/${prefix}`;

/** `<prefix>.index.json`, the index of `<prefix>.tar.gz`; null when it isn't uploaded (or expired). */
export const getArchiveIndex = async (archive: ArchiveRef): Promise<ArchiveIndex | null> => {
  const cached = indexes.get(cacheKey(archive));
  if (cached) {
    return cached;
  }
  const text = await readObjectText(archive.bucket, `${archive.prefix}.index.json`);
  if (text === null) {
    return null;
  }
  const index = ArchiveIndexSchema.parse(JSON.parse(text));
  indexes.set(cacheKey(archive), index);
  return index;
};

/** Streams one file's content out of `<prefix>.tar.gz`, `path` relative to the archive root. */
export const readArchiveFile = async (
  archive: ArchiveRef,
  path: string
): Promise<{ size: number; stream: Readable }> => {
  const index = await getArchiveIndex(archive);
  const file = index?.files.find((f) => f.path === path);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  const member = await streamObjectRange(
    archive.bucket,
    `${archive.prefix}.tar.gz`,
    file.offset,
    file.offset + file.length - 1
  );
  if (!member) {
    // Expired (the hosted-evals bucket's lifecycle rule) while its index was still cached.
    indexes.delete(cacheKey(archive));
    throw new NotFoundError("This file is no longer available");
  }
  const gunzip = createGunzip();
  // Stopping early (the file ends before its member does) destroys the gunzip
  // stream, and the pipeline then aborts the S3 download.
  pipeline(member, gunzip).catch(() => {});
  return { size: file.size, stream: Readable.from(slice(gunzip, file.dataOffset, file.size)) };
};

/** A file download response for user content: never let the browser render it as a page. */
export const archiveFileResponse = (path: string, { size, stream }: { size: number; stream: Readable }): Response => {
  const name = path.split("/").pop() || "file";
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
