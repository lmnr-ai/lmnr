import { cancelSubscription } from "@/lib/actions/checkout";
import { type CancellationReason } from "@/lib/actions/checkout/types";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const reason = (body.reason as CancellationReason) ?? "other";
  const comment = typeof body.comment === "string" ? body.comment : "";
  return Response.json(await cancelSubscription(workspaceId, reason, comment));
});
