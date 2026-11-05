import { sendTestSlackNotification } from "@/lib/actions/slack";
import { apiHandler } from "@/lib/api/api-handler";
import { noAudit } from "@/lib/audit";

export const POST = noAudit(
  "sends a test message; changes nothing",
  apiHandler<{ workspaceId: string; channelId: string }>(async (request, ctx) => {
    const { workspaceId, channelId } = await ctx.params;

    const body = await request.json();
    const result = await sendTestSlackNotification({
      workspaceId,
      channelId,
      eventName: body.eventName,
    });
    return Response.json(result);
  })
);
