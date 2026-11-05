import { addUsageWarning, getUsageWarnings, removeUsageWarning } from "@/lib/actions/usage/usage-warnings";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const warnings = await getUsageWarnings({ workspaceId });
  return Response.json(warnings);
});

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "update", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    const result = await addUsageWarning({ ...body, workspaceId });
    return Response.json(result);
  }
);

export const DELETE = withAudit<{ workspaceId: string }>(
  { resource: "workspace", action: "update", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    await removeUsageWarning({ ...body, workspaceId });
    return Response.json({ success: true });
  }
);
