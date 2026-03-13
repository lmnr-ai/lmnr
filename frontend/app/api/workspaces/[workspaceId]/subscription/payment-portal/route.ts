import { getPaymentMethodPortalUrl } from "@/lib/actions/checkout";
import { handleRoute } from "@/lib/api/route-handler";

export const POST = handleRoute<
  { workspaceId: string },
  { url: Awaited<ReturnType<typeof getPaymentMethodPortalUrl>> }
>(async (req, { workspaceId }) => {
  const body = await req.json();
  const url = await getPaymentMethodPortalUrl({ workspaceId, returnUrl: body.returnUrl });
  return { url };
});
