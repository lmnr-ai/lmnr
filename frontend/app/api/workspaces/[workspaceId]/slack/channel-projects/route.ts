import {
  deleteChannelProjectBinding,
  getChannelProjectBindings,
  upsertChannelProjectBinding,
} from "@/lib/actions/slack/channel-projects";
import { apiHandler } from "@/lib/api/api-handler";
import { handlerWithAudit } from "@/lib/audit";

// Auth: proxy.ts gates /api/workspaces/:workspaceId/* via isUserMemberOfWorkspace, so a non-member
// never reaches these handlers — no in-handler authz needed.

type Params = { workspaceId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await getChannelProjectBindings(workspaceId));
});

export const PUT = handlerWithAudit<Params>(
  { resource: "slack_integration", action: "update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    await audit.target(body.channelId, { name: body.channelName });
    await upsertChannelProjectBinding({
      workspaceId,
      channelId: body.channelId,
      channelName: body.channelName,
      projectId: body.projectId,
    });
    return Response.json({ success: true });
  }
);

export const DELETE = handlerWithAudit<Params>(
  { resource: "slack_integration", action: "update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const channelId = req.nextUrl.searchParams.get("channelId");
    if (!channelId) {
      return Response.json({ error: "channelId query param is required" }, { status: 400 });
    }
    await audit.target(channelId);
    await deleteChannelProjectBinding({ workspaceId, channelId });
    return Response.json({ success: true });
  }
);
