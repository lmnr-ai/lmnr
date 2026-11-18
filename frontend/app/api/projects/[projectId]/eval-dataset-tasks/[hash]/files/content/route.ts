import { type NextRequest } from "next/server";

import { readEvalDatasetTaskFile } from "@/lib/actions/eval-datasets/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { archiveFileResponse } from "@/lib/api/file-response";

/** One file of a pushed task, `?path=` relative to the task dir. */
export const GET = apiHandler<{ projectId: string; hash: string }>(async (req: NextRequest, ctx) => {
  const { projectId, hash } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  return archiveFileResponse(path, await readEvalDatasetTaskFile({ projectId, hex: hash, path }));
});
