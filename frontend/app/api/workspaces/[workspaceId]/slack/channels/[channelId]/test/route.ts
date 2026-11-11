import { sendTestSlackNotification } from "@/lib/actions/slack";
import { getVisibleSlackChannels, SlackChannelNotVisibleError } from "@/lib/actions/slack/visibility";
import { apiHandler } from "@/lib/api/api-handler";
import { AuthorizationError } from "@/lib/api/errors";
import { handlerNoAudit } from "@/lib/audit";
import { getServerSession } from "@/lib/auth-session";

export const POST = handlerNoAudit(
  "sends a test message; changes nothing",
  apiHandler<{ workspaceId: string; channelId: string }>(async (request, ctx) => {
    const { workspaceId, channelId } = await ctx.params;

    const session = await getServerSession();
    if (!session) throw new AuthorizationError("Unauthorized", 401);
    if (!(await getVisibleSlackChannels(workspaceId, session.user.id)).has(channelId)) {
      throw new SlackChannelNotVisibleError([channelId]);
    }

    const body = await request.json();
    const result = await sendTestSlackNotification({
      workspaceId,
      channelId,
      eventName: body.eventName,
    });
    return Response.json(result);
  })
);
