import { type NextRequest } from "next/server";

import { getAgentVersionPrefix } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";
import { fileResponse, readArchiveFile } from "@/lib/hosted-evals/archive";

/** One file of a version of the agent's scripts, `?path=` relative to the agent dir. */
export const GET = apiHandler<{ projectId: string; agentId: string; versionId: string }>(
  async (req: NextRequest, ctx) => {
    const { projectId, agentId, versionId } = await ctx.params;
    const path = req.nextUrl.searchParams.get("path");
    if (!path) {
      throw new ApiError("path is required", 400);
    }
    const prefix = await getAgentVersionPrefix(projectId, agentId, versionId);
    return fileResponse(await readArchiveFile(prefix, path), path);
  }
);
