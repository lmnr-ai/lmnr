import { getMetricAlerts } from "@/lib/actions/alerts/metric";
import { apiHandler } from "@/lib/api/api-handler";
import { getServerSession } from "@/lib/auth-session";

export const GET = apiHandler<{ projectId: string }>(async (_request, ctx) => {
  const { projectId } = await ctx.params;
  const session = await getServerSession();
  return Response.json(await getMetricAlerts(projectId, session?.user?.email ?? undefined));
});
