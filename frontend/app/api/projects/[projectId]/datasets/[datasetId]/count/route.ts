import { countDatapoints } from "@/lib/actions/datapoints";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; datasetId: string }, unknown>(
  async (_req, params) =>
    await countDatapoints({
      projectId: params.projectId,
      datasetId: params.datasetId,
    })
);
