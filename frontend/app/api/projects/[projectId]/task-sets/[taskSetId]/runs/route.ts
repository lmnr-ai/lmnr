import { getTaskSetRuns } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";

/** The evaluations that ran any version of the task set. */
export const GET = apiHandler<{ projectId: string; taskSetId: string }>(async (_req, ctx) => {
  const { projectId, taskSetId } = await ctx.params;
  return Response.json(await getTaskSetRuns(projectId, taskSetId));
});
