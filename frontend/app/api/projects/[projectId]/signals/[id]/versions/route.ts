import { getSignalVersions } from "@/lib/actions/signal-versions";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (_req, ctx) => {
  const { projectId, id } = await ctx.params;
  return Response.json(await getSignalVersions({ projectId, signalId: id }));
});
