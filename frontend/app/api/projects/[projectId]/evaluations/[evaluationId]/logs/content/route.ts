import { Readable } from "node:stream";

import { type NextRequest } from "next/server";

import { readTrialLogFile } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";

/** One file of a trial's dir, `?trial=` its Harbor trial name and `?path=` relative to the dir. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const trial = req.nextUrl.searchParams.get("trial");
  const path = req.nextUrl.searchParams.get("path");
  if (!trial || !path) {
    throw new ApiError("trial and path are required", 400);
  }
  const { size, stream } = await readTrialLogFile(projectId, evaluationId, trial, path);
  const name = path.split("/").pop() ?? "file";
  // User content: never let the browser render it as a page.
  return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
      "X-Content-Type-Options": "nosniff",
    },
  });
});
