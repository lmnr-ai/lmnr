import { removeUserFromWorkspace } from "@/lib/actions/workspace";
import { apiHandler } from "@/lib/api/api-handler";

export const DELETE = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const userId = req.nextUrl.searchParams.get("id");

  if (!userId) {
    return Response.json({ error: "No user id was provided" }, { status: 400 });
  }

  await removeUserFromWorkspace({ workspaceId, userId });
  return new Response("User removed successfully.", { status: 200 });
});
