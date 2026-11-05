import { getTrialPaymentUrl } from "@/lib/actions/checkout/trial";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "subscription", action: "update" },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;
    const body = await req.json();
    const url = await getTrialPaymentUrl({ workspaceId, returnUrl: body.returnUrl, tier: body.tier });
    return Response.json({ url });
  }
);
