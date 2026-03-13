import { getParquets, startParquetExportJob } from "@/lib/actions/dataset";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; datasetId: string }, unknown>(
  async (_req, params) => await getParquets(params.projectId, params.datasetId)
);

export const POST = handleRoute<{ projectId: string; datasetId: string }, unknown>(
  async (_req, params) => await startParquetExportJob(params.projectId, params.datasetId)
);
