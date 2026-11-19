import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";

import { z } from "zod/v4";

import { NotFoundError } from "@/lib/api/errors";
import { readExportText, streamExportRange } from "@/lib/s3";
import { SimpleLRU } from "@/lib/simple-lru";

/*
 * Archives in the exports bucket: what a remote run (`lmnr-cli eval run
 * --remote`) uploads (the evals folder, and each dataset's Harbor job output at
 * `<upload>/jobs/<suite>`) and pushed task versions (`<project>/datasets/…`).
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

/** `<prefix>.index.json`, the index of `<prefix>.tar.gz`; null when it isn't uploaded (or expired). */
export const getArchiveIndex = async (prefix: string): Promise<ArchiveIndex | null> => {
  const cached = indexes.get(prefix);
  if (cached) {
    return cached;
  }
  const text = await readExportText(`${prefix}.index.json`);
  if (text === null) {
    return null;
  }
  const index = ArchiveIndexSchema.parse(JSON.parse(text));
  indexes.set(prefix, index);
  return index;
};

/** Streams one file's content out of `<prefix>.tar.gz`, `path` relative to the archive root. */
export const readArchiveFile = async (prefix: string, path: string): Promise<{ size: number; stream: Readable }> => {
  const index = await getArchiveIndex(prefix);
  const file = index?.files.find((f) => f.path === path);
  if (!file) {
    throw new NotFoundError("File not found");
  }
  const member = await streamExportRange(`${prefix}.tar.gz`, file.offset, file.offset + file.length - 1);
  if (!member) {
    // Expired (the bucket's lifecycle rule on `hosted-evals/`) while its index was still cached.
    indexes.delete(prefix);
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
