import { type NextRequest } from "next/server";

import { readTaskVersionFile } from "@/lib/actions/eval-datasets";
import { archiveFileResponse } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";

type Params = { projectId: string; datasetId: string; taskId: string; hash: string };

/** One file of a pushed task version, `?path=` relative to the task dir. */
export const GET = apiHandler<Params>(async (req: NextRequest, ctx) => {
  const { projectId, datasetId, taskId, hash } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  return archiveFileResponse(path, await readTaskVersionFile(projectId, datasetId, taskId, hash, path));
});
