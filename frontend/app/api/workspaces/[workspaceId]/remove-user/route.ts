import { removeUserFromWorkspace } from "@/lib/actions/workspace";
import { handlerWithAudit } from "@/lib/audit";
import { getUserEmail } from "@/lib/audit/labels";

export const DELETE = handlerWithAudit<{ workspaceId: string }>(
  { resource: "member", action: "remove" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const userId = req.nextUrl.searchParams.get("id");

    if (!userId) {
      return Response.json({ error: "No user id was provided" }, { status: 400 });
    }
    await audit.target(userId, { name: await getUserEmail(userId) });

    await removeUserFromWorkspace({ workspaceId, userId });
    return new Response("User removed successfully.", { status: 200 });
  }
);
