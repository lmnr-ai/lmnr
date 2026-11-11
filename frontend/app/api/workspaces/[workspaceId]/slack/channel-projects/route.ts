import {
  deleteChannelProjectBinding,
  getChannelProjectBindings,
  upsertChannelProjectBinding,
} from "@/lib/actions/slack/channel-projects";
import { getVisibleSlackChannels, SlackChannelNotVisibleError } from "@/lib/actions/slack/visibility";
import { apiHandler } from "@/lib/api/api-handler";
import { AuthorizationError } from "@/lib/api/errors";
import { handlerWithAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

// Auth: proxy.ts gates /api/workspaces/:workspaceId/* via isUserMemberOfWorkspace, so a non-member
// never reaches these handlers — no in-handler authz needed.

type Params = { workspaceId: string };

async function requireUserId(): Promise<string> {
  const session = await getServerSession();
  if (!session) throw new AuthorizationError("Unauthorized", 401);
  return session.user.id;
}

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json(await getChannelProjectBindings(workspaceId, await requireUserId()));
});

export const PUT = handlerWithAudit<Params>(
  { resource: "slack_integration", action: "update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    // Only channels the caller can see may be bound; the name comes from Slack, not the client.
    const channel = (await getVisibleSlackChannels(workspaceId, await requireUserId())).get(body.channelId);
    if (!channel) throw new SlackChannelNotVisibleError([String(body.channelId)]);
    // Id only: audit readers may not be members of a private channel.
    await audit.target(body.channelId);
    await upsertChannelProjectBinding({
      workspaceId,
      channelId: channel.id,
      channelName: channel.name,
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
