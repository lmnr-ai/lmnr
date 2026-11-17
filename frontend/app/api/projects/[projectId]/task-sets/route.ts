import { getTaskSets } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";

/** Every task set of the project, by name. */
export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getTaskSets(projectId));
});
