import { getDatapoint, updateDatapoint } from "@/lib/actions/datapoint";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; datasetId: string; datapointId: string }, unknown>(
  async (_req, params) =>
    await getDatapoint({
      projectId: params.projectId,
      datapointId: params.datapointId,
      datasetId: params.datasetId,
    })
);

export const POST = handleRoute<{ projectId: string; datasetId: string; datapointId: string }, unknown>(
  async (req, params) => {
    const body = await req.json();

    await updateDatapoint({
      projectId: params.projectId,
      datapointId: params.datapointId,
      datasetId: params.datasetId,
      data: body.data,
      target: body.target,
      metadata: body.metadata,
      createdAt: body.createdAt,
    });

    return { success: true };
  }
);
