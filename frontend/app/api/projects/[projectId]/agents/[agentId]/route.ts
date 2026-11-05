import { renameAgent } from "@/lib/actions/agents";
import { NotFoundError } from "@/lib/api/errors";
import { withAudit } from "@/lib/audit";

export const PATCH = withAudit<{ projectId: string; agentId: string }>(
  { resource: "agent", action: "update" },
  async (req, ctx) => {
    const { projectId, agentId } = await ctx.params;
    const body = await req.json();
    const agent = await renameAgent({ projectId, agentId, name: body?.name });
    if (!agent) throw new NotFoundError("Agent not found");
    return Response.json(agent);
  }
);
