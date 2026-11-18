import { getEvalDatasetVersion } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

/** One version with its tasks. */
export const GET = apiHandler<{ projectId: string; datasetName: string; version: string }>(async (_req, ctx) => {
  const { projectId, datasetName, version } = await ctx.params;
  return Response.json(await getEvalDatasetVersion({ projectId, datasetName, version }));
});
