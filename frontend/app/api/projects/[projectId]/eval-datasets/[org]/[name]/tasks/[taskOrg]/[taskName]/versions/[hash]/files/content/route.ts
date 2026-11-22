import { type NextRequest } from "next/server";

import { readTaskVersionFile } from "@/lib/actions/eval-datasets";
import { archiveFileResponse } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";
import { ApiError } from "@/lib/api/errors";

type Params = { projectId: string; org: string; name: string; taskOrg: string; taskName: string; hash: string };

/** One file of a pushed task version, `?path=` relative to the task dir. */
export const GET = apiHandler<Params>(async (req: NextRequest, ctx) => {
  const { projectId, org, name, taskOrg, taskName, hash } = await ctx.params;
  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    throw new ApiError("path is required", 400);
  }
  const file = await readTaskVersionFile(projectId, `${org}/${name}`, `${taskOrg}/${taskName}`, hash, path);
  return archiveFileResponse(path, file);
});
