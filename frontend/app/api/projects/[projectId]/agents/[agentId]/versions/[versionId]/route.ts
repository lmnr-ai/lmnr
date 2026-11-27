import { deleteAgentVersion } from "@/lib/actions/agents/deleted-versions";
import { handlerWithAudit } from "@/lib/audit";

export const DELETE = handlerWithAudit<{ projectId: string; agentId: string; versionId: string }>(
  { resource: "agent", action: "update" },
  async (_req, ctx, audit) => {
    const { projectId, agentId, versionId } = await ctx.params;
    await deleteAgentVersion({ projectId, agentId, versionId });
    audit.set({ metadata: { deletedVersionId: versionId } });
    await audit.target(agentId);
    return Response.json({ id: versionId });
  }
);
