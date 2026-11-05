import { switchTier } from "@/lib/actions/checkout";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "subscription", action: "update" },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;

    const body = await req.json();
    await switchTier({ workspaceId, tier: body.tier });
    return Response.json({ success: true });
  }
);
