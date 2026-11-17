import { getVersionTasks } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";

/** The tasks of one version of the task set. */
export const GET = apiHandler<{ projectId: string; taskSetId: string; versionId: string }>(async (_req, ctx) => {
  const { projectId, taskSetId, versionId } = await ctx.params;
  return Response.json(await getVersionTasks(projectId, taskSetId, versionId));
});
