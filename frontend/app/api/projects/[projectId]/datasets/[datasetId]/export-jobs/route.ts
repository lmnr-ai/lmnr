import { getExportJob } from "@/lib/actions/dataset-export-jobs";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; datasetId: string }, unknown>(
  async (_req, params) =>
    await getExportJob({
      projectId: params.projectId,
      datasetId: params.datasetId,
    })
);
