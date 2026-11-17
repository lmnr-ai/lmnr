import { getTaskSetLink } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

/** The task set (and agent) a version belongs to, for the evaluation header's link. */
export const GET = apiHandler<{ projectId: string; versionId: string }>(async (_req, ctx) => {
  const { projectId, versionId } = await ctx.params;
  const link = await getTaskSetLink(projectId, versionId);
  if (!link) {
    throw new NotFoundError("Task set version not found");
  }
  return Response.json(link);
});
