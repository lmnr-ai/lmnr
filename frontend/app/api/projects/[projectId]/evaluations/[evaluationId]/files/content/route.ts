import { type NextRequest } from "next/server";

import { readEvaluationFile } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { fileResponse } from "@/lib/hosted-evals/archive";

/** One file of the evaluation's task-set version, `?path=` relative to the task set's root. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  return fileResponse(await readEvaluationFile(projectId, evaluationId, path), path);
});
