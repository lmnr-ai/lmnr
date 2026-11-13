import { getTraceHealth } from "@/lib/actions/trace-health";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;
  const params = req.nextUrl.searchParams;

  return Response.json(
    await getTraceHealth({
      projectId,
      pastHours: params.get("pastHours") ?? undefined,
      startDate: params.get("startDate") ?? undefined,
      endDate: params.get("endDate") ?? undefined,
    })
  );
});
