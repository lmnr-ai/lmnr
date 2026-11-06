import { updateRole } from "@/lib/actions/workspace";
import { handlerWithAudit } from "@/lib/audit";
import { getUserEmail } from "@/lib/audit/labels";

export const PATCH = handlerWithAudit<{ workspaceId: string }>(
  { resource: "member", action: "role_update" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    if (typeof body.userId === "string") {
      audit.set({ metadata: { role: body.role } });
      await audit.target(body.userId, { name: await getUserEmail(body.userId) });
    }

    await updateRole({
      workspaceId,
      ...body,
    });

    return Response.json({ success: true, message: "User role updated successfully" });
  }
);
