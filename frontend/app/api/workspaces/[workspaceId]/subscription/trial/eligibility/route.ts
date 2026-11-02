import { canStartStarterTrial } from "@/lib/actions/checkout/trial";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  return Response.json({ eligible: await canStartStarterTrial(workspaceId) });
});
