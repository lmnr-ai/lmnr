import { getPaymentMethodPortalUrl } from "@/lib/actions/checkout";
import { withAudit } from "@/lib/audit";

export const POST = withAudit<{ workspaceId: string }>(
  { resource: "subscription", action: "view", noTarget: true },
  async (req, ctx) => {
    const { workspaceId } = await ctx.params;

    const body = await req.json();
    const url = await getPaymentMethodPortalUrl({ workspaceId, returnUrl: body.returnUrl });
    return Response.json({ url });
  }
);
