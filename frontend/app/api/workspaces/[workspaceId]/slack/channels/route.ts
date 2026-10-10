import { getSlackChannels } from "@/lib/actions/slack";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  const result = await getSlackChannels(workspaceId);
  return Response.json(result);
});
