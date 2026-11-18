import { Readable } from "node:stream";

/** A file read out of an uploaded archive, as a download: it's user content, so never let the browser render it. */
export const archiveFileResponse = (path: string, { size, stream }: { size: number; stream: Readable }) =>
  new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(path.split("/").pop() || "file")}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
