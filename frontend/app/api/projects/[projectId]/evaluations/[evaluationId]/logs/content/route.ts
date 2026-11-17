import { type NextRequest } from "next/server";

import { readTrialLogFile } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { fileResponse } from "@/lib/hosted-evals/archive";

/** One file of a trial's dir, `?trial=` its Harbor trial name and `?path=` relative to the dir. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const trial = req.nextUrl.searchParams.get("trial");
  const path = req.nextUrl.searchParams.get("path");
  if (!trial || !path) {
    throw new ApiError("trial and path are required", 400);
  }
  return fileResponse(await readTrialLogFile(projectId, evaluationId, trial, path), path);
});
