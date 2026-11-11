import { getSlackChannels } from "@/lib/actions/slack";
import { apiHandler } from "@/lib/api/api-handler";
import { AuthorizationError } from "@/lib/api/errors";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ workspaceId: string }>(async (_request, ctx) => {
  const { workspaceId } = await ctx.params;

  const session = await getServerSession();
  if (!session) throw new AuthorizationError("Unauthorized", 401);

  const result = await getSlackChannels(workspaceId, session.user.id);
  return Response.json(result);
});
