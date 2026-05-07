import { getMainAgentIOBatch } from "@/lib/actions/sessions/trace-io";
import { apiHandler } from "@/lib/api/api-handler";

export const POST = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const body = await req.json();
  const result = await getMainAgentIOBatch({ ...body, projectId });
  return Response.json(result);
});
