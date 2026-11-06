import { getUsageLimits, removeUsageLimit, setUsageLimit } from "@/lib/actions/usage/custom-usage-limits";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const limits = await getUsageLimits({ workspaceId });
  return Response.json(limits);
});

export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "update", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    const result = await setUsageLimit({ ...body, workspaceId });
    return Response.json(result);
  }
);

export const DELETE = handlerWithAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "update", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    await removeUsageLimit({ ...body, workspaceId });
    return Response.json({ success: true });
  }
);
