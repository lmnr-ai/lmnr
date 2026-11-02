import { startStarterNow } from "@/lib/actions/checkout/trial";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  await startStarterNow(workspaceId);
  return Response.json({ success: true });
});
