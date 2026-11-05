import { getPaymentMethodPortalUrl } from "@/lib/actions/checkout";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;

  const body = await req.json();
  const url = await getPaymentMethodPortalUrl({ workspaceId, returnUrl: body.returnUrl });
  return Response.json({ url });
});
