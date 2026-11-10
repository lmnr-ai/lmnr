import { getAgentVersions } from "@/lib/actions/agents";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

export const GET = apiHandler<{ projectId: string; agentId: string }>(async (_req, ctx) => {
  const { projectId, agentId } = await ctx.params;
  const result = await getAgentVersions({ projectId, agentId });
  if (!result) throw new NotFoundError("Agent not found");
  return Response.json(result);
});
