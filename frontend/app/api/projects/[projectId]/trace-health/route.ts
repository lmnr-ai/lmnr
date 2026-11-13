import { getTraceHealth } from "@/lib/actions/trace-health";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const pastHours = req.nextUrl.searchParams.get("pastHours") ?? "24";

  return Response.json(await getTraceHealth({ projectId, pastHours: Number(pastHours) }));
});
