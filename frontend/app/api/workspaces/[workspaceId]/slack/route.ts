import { deleteSlackIntegration, getSlackIntegration } from "@/lib/actions/slack";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

export const GET = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  const integration = await getSlackIntegration(workspaceId);
  return Response.json(integration);
});

export const DELETE = withAudit<{ workspaceId: string }>(
  { resource: "slack_integration", action: "delete", noTarget: true },
  async (_request, ctx) => {
    const { workspaceId } = await ctx.params;

    await deleteSlackIntegration({ workspaceId });
    return Response.json({ success: true });
  }
);
