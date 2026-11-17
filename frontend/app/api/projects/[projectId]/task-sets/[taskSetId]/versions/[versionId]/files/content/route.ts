import { type NextRequest } from "next/server";

import { getTaskSetVersionPrefix } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { fileResponse, readArchiveFile } from "@/lib/hosted-evals/archive";

/** One file of a version of the task set, `?path=` relative to its root. */
export const GET = apiHandler<{ projectId: string; taskSetId: string; versionId: string }>(
  async (req: NextRequest, ctx) => {
    const { projectId, taskSetId, versionId } = await ctx.params;
    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      throw new ApiError("path is required", 400);
    }
    const prefix = await getTaskSetVersionPrefix(projectId, taskSetId, versionId);
    return fileResponse(await readArchiveFile(prefix, path), path);
  }
);
