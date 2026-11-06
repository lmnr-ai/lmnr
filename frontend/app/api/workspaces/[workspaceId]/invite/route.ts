import { inviteUserToWorkspace } from "@/lib/actions/workspace/invite";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = (await req.json()) as { email: string };

  await inviteUserToWorkspace({
    workspaceId,
    ...body,
  });

  return Response.json({ success: true });
});
