import { getTrialPaymentUrl } from "@/lib/actions/checkout/trial";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  const url = await getTrialPaymentUrl({ workspaceId, returnUrl: body.returnUrl, tier: body.tier });
  return Response.json({ url });
});
