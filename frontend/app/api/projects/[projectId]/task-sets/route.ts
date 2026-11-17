import { getTaskSetGroups } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";

/** Every agent of the project with its task sets. */
export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getTaskSetGroups(projectId));
});
