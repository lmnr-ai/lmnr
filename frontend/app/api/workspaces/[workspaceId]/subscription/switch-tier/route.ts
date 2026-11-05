import { switchTier } from "@/lib/actions/checkout";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;

  const body = await req.json();
  await switchTier({ workspaceId, tier: body.tier });
  return Response.json({ success: true });
});
