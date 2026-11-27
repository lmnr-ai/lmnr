import { type NextRequest } from "next/server";

import { archiveFileResponse } from "@/lib/actions/evaluation/files";
import { readTrialFile } from "@/lib/actions/evaluation/trial-files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";

/** One file of the trial's listing, `?path=` a tree path (`task/…`, `agent/…`, `logs/…`). */
export const GET = apiHandler<{ projectId: string; evaluationId: string; trialId: string }>(
  async (req: NextRequest, ctx) => {
    const { projectId, evaluationId, trialId } = await ctx.params;
    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      throw new ApiError("path is required", 400);
    }
    const file = await readTrialFile(projectId, evaluationId, trialId, path);
    return archiveFileResponse(path, file);
  }
);
