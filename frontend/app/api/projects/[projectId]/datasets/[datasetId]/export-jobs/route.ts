import { getExportJob } from "@/lib/actions/dataset-export-jobs";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; datasetId: string }>(async (_req, ctx) => {
  const { projectId, datasetId } = await ctx.params;

  const job = await getExportJob({ projectId, datasetId });
  return Response.json(job);
});
