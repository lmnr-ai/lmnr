import { addUsageWarning, getUsageWarnings, removeUsageWarning } from "@/lib/actions/usage/usage-warnings";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ workspaceId: string }>(async (_req, ctx) => {
  const { workspaceId } = await ctx.params;
  const warnings = await getUsageWarnings({ workspaceId });
  return Response.json(warnings);
});

export const POST = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  const result = await addUsageWarning({ ...body, workspaceId });
  return Response.json(result);
});

export const DELETE = apiHandler<{ workspaceId: string }>(async (req, ctx) => {
  const { workspaceId } = await ctx.params;
  const body = await req.json();
  await removeUsageWarning({ ...body, workspaceId });
  return Response.json({ success: true });
});
