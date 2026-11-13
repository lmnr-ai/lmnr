import { getTraceHealth } from "@/lib/actions/trace-health";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getTraceHealth({ projectId }));
});
