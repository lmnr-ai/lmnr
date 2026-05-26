import { getWorkspaceUsers } from "@/lib/actions/workspace";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const users = await getWorkspaceUsers({ workspaceId });

  return Response.json(users);
});
