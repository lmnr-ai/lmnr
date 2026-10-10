import { sendTestSlackNotification } from "@/lib/actions/slack";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string; channelId: string }>(async (request, ctx) => {
  const { workspaceId, channelId } = await ctx.params;

  const body = await request.json();
  const result = await sendTestSlackNotification({
    workspaceId,
    channelId,
    eventName: body.eventName,
  });
  return Response.json(result);
});
