import { type NextRequest } from "next/server";

import { readTrialOutputFile } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { archiveFileResponse } from "@/lib/api/file-response";

/** One file of a trial's dir in its Harbor job, `?trial=` its Harbor trial name and `?path=` relative to the dir. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const trial = req.nextUrl.searchParams.get("trial");
  const path = req.nextUrl.searchParams.get("path");
  if (!trial || !path) {
    throw new ApiError("trial and path are required", 400);
  }
  return archiveFileResponse(path, await readTrialOutputFile(projectId, evaluationId, trial, path));
});
