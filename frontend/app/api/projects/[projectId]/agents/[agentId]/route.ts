import { renameAgent } from "@/lib/actions/agents";
import { NotFoundError } from "@/lib/api/errors";
import { handlerWithAudit } from "@/lib/audit";

export const PATCH = handlerWithAudit<{ projectId: string; agentId: string }>(
  { resource: "agent", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, agentId } = await ctx.params;
    const body = await req.json();
    const agent = await renameAgent({ projectId, agentId, name: body?.name });
    if (!agent) throw new NotFoundError("Agent not found");
    await audit.target(agentId, { name: agent.name ?? undefined });
    return Response.json(agent);
  }
);
