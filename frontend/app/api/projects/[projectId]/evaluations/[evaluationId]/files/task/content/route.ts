import { type NextRequest } from "next/server";

import { readTrialTaskFile } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { archiveFileResponse } from "@/lib/api/file-response";

import { trialTaskRefOf } from "../ref";

/** One file of a trial's task dir (resolved as in `../route.ts`), `?path=` relative to it. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const params = req.nextUrl.searchParams;
  const path = params.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  return archiveFileResponse(path, await readTrialTaskFile(projectId, evaluationId, trialTaskRefOf(params), path));
});
