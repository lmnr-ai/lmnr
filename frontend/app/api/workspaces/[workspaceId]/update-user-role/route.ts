import { updateRole } from "@/lib/actions/workspace";
import { withAudit } from "@/lib/audit";
import { getUserEmail } from "@/lib/audit/labels";

export const PATCH = withAudit<{ workspaceId: string }>(
  { resource: "member", action: "role_update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    if (typeof body.userId === "string") {
      audit.set({
        resourceId: body.userId,
        resourceLabel: await getUserEmail(body.userId),
        metadata: { role: body.role },
      });
    }

    await updateRole({
      workspaceId,
      ...body,
    });

    return Response.json({ success: true, message: "User role updated successfully" });
  }
);
