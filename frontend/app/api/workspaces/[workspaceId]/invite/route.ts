import { inviteUserToWorkspace } from "@/lib/actions/workspace/invite";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "member", action: "invite" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = (await req.json()) as { email: string };
    await audit.target(null, { name: body.email });

    await inviteUserToWorkspace({
      workspaceId,
      ...body,
    });

    return Response.json({ success: true });
  }
);
