import { getSignalsStats } from "@/lib/actions/signals/stats";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const { projectId } = await ctx.params;

  const signalIds = req.nextUrl.searchParams.getAll("signalId");
  const pastHours = req.nextUrl.searchParams.get("pastHours") || "168";

  if (signalIds.length === 0) {
    return Response.json({ error: "At least one signalId is required" }, { status: 400 });
  }

  return Response.json(await getSignalsStats({ projectId, signalIds, pastHours: Number(pastHours) }));
});
