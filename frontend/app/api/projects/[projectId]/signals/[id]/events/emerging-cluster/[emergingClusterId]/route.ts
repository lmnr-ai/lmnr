import { getEmergingClusterName } from "@/lib/actions/events/emerging-cluster";
import { hasClusteringAccessForProject } from "@/lib/actions/usage/utils";
import { apiHandler } from "@/lib/api/api-handler";
import { PAYWALL_CLUSTER_NAME } from "@/lib/features/clustering";

export const GET = apiHandler<{ projectId: string; id: string; emergingClusterId: string }>(async (_req, ctx) => {
  const { projectId, id: signalId, emergingClusterId } = await ctx.params;

  const [result, hasAccess] = await Promise.all([
    getEmergingClusterName({ projectId, signalId, emergingClusterId }),
    hasClusteringAccessForProject(projectId),
  ]);

  if (!result) {
    return Response.json({ error: "Emerging cluster not found." }, { status: 404 });
  }

  return Response.json(hasAccess ? result : { name: PAYWALL_CLUSTER_NAME });
});
