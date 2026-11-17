import { deleteEvalAgent, getAgentTaskSets } from "@/lib/actions/task-sets";
import { handlerWithAudit } from "@/lib/audit";

/** Deletes the agent with its scripts and every task set it has; audited as those task sets' deletion. */
export const DELETE = handlerWithAudit<{ projectId: string; agentId: string }>(
  { resource: "task_set", action: "delete" },
  async (_req, ctx, audit) => {
    const { projectId, agentId } = await ctx.params;
    const sets = await getAgentTaskSets(projectId, agentId);
    await audit.target(
      sets.map((s) => s.id),
      { parent: { evalAgentId: agentId } }
    );
    await deleteEvalAgent(projectId, agentId);
    return Response.json({ message: "Agent deleted" });
  }
);
