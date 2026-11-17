import { getAgentVersions } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";

/** Every version of the agent's scripts, newest first. */
export const GET = apiHandler<{ projectId: string; agentId: string }>(async (_req, ctx) => {
  const { projectId, agentId } = await ctx.params;
  return Response.json(await getAgentVersions(projectId, agentId));
});
