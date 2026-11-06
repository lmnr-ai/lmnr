import { transferOwnership } from "@/lib/actions/workspace";
import { handlerWithAudit } from "@/lib/audit";
import { getUserEmail } from "@/lib/audit/labels";

export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "member", action: "transfer_ownership" },
  async (req, ctx, audit) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    if (typeof body.newOwnerId === "string") {
      await audit.target(body.newOwnerId, { name: await getUserEmail(body.newOwnerId) });
    }

    await transferOwnership({
      workspaceId,
      currentOwnerId: body.currentOwnerId,
      newOwnerId: body.newOwnerId,
    });

    return Response.json({ success: true });
  }
);
