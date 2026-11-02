import { renameAgent } from "@/lib/actions/agents";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

export const PATCH = apiHandler<{ projectId: string; agentId: string }>(async (req, ctx) => {
  const { projectId, agentId } = await ctx.params;
  const body = await req.json();
  const agent = await renameAgent({ projectId, agentId, name: body?.name });
  if (!agent) throw new NotFoundError("Agent not found");
  return Response.json(agent);
});
