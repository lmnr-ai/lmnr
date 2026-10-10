import { getAgentOutputsBatch } from "@/lib/actions/traces/outputs";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const result = await getAgentOutputsBatch({ ...body, projectId });
  return Response.json(result);
});
