import { getMetricAlert } from "@/lib/actions/alerts/metric";
import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ projectId: string; alertId: string }>(async (_request, ctx) => {
  const { projectId, alertId } = await ctx.params;
  const session = await getServerSession();
  return Response.json(await getMetricAlert(projectId, alertId, session?.user?.email ?? undefined));
});
