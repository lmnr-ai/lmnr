import { getUsageLimits, removeUsageLimit, setUsageLimit } from "@/lib/actions/usage/custom-usage-limits";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const limits = await getUsageLimits({ workspaceId });
  return Response.json(limits);
});

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  const result = await setUsageLimit({ ...body, workspaceId });
  return Response.json(result);
});

export const DELETE = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  await removeUsageLimit({ ...body, workspaceId });
  return Response.json({ success: true });
});
