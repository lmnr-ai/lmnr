import { type NextRequest } from "next/server";

import { readRunAgentFile } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { archiveFileResponse } from "@/lib/api/file-response";

/** One file of the run's `agent/` dir, `?path=` relative to it. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (req: NextRequest, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  return archiveFileResponse(path, await readRunAgentFile(projectId, evaluationId, path));
});
