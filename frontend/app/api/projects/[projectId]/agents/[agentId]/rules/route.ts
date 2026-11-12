import { addAgentRule, removeAgentRule } from "@/lib/actions/agents/definition";
import { handlerWithAudit } from "@/lib/audit";

export const POST = handlerWithAudit<{ projectId: string; agentId: string }>(
  { resource: "agent", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, agentId } = await ctx.params;
    const body = await req.json();
    const definition = await addAgentRule({ projectId, agentId, substrings: body?.substrings });
    await audit.target(agentId);
    return Response.json(definition);
  }
);

export const DELETE = handlerWithAudit<{ projectId: string; agentId: string }>(
  { resource: "agent", action: "update" },
  async (req, ctx, audit) => {
    const { projectId, agentId } = await ctx.params;
    const body = await req.json();
    const definition = await removeAgentRule({ projectId, agentId, substrings: body?.substrings });
    await audit.target(agentId);
    return Response.json(definition);
  }
);
