import { switchTier } from "@/lib/actions/checkout";
import { handlerWithAudit } from "@/lib/audit";

export const POST = handlerWithAudit<{ workspaceId: string }>(
  { resource: "subscription", action: "update", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;

    const body = await req.json();
    await switchTier({ workspaceId, tier: body.tier });
    return Response.json({ success: true });
  }
);
