import { type NextRequest } from "next/server";

import { readTaskVersionFile } from "@/lib/actions/eval-datasets/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { archiveFileResponse } from "@/lib/api/file-response";

type Params = { projectId: string; datasetName: string; taskName: string; hash: string };

/** One file of a task version, `?path=` relative to the task dir. */
export const GET = apiHandler<Params>(async (req: NextRequest, ctx) => {
  const { projectId, datasetName, taskName, hash } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  const ref = { projectId, dataset: datasetName, task: taskName, hash };
  return archiveFileResponse(path, await readTaskVersionFile(ref, path));
});
