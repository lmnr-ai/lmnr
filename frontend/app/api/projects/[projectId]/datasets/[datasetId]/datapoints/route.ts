import { createDatapoints, CreateDatapointsSchema, deleteDatapoints, getDatapoints } from "@/lib/actions/datapoints";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; datasetId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);
  const pageNumber = parseInt(searchParams.get("pageNumber") ?? "0") || 0;
  const pageSize = parseInt(searchParams.get("pageSize") ?? "50") || 50;

  return await getDatapoints({
    projectId: params.projectId,
    datasetId: params.datasetId,
    pageNumber,
    pageSize,
  });
});

export const POST = handleRoute<{ projectId: string; datasetId: string }, unknown>(async (req, params) => {
  const body = await req.json();

  // Validate request body
  const parseResult = CreateDatapointsSchema.safeParse(body);
  if (!parseResult.success) {
    throw new Error("Invalid request body");
  }

  const { datapoints, sourceSpanId } = parseResult.data;

  return await createDatapoints({
    projectId: params.projectId,
    datasetId: params.datasetId,
    datapoints,
    sourceSpanId,
  });
});

// Note: this endpoint allows a body in a DELETE request, which is not standard
// but fits our purposes: (1) this is an internal API, (2) passing many
// datapoint IDs in the URL may break
export const DELETE = handleRoute<{ projectId: string; datasetId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const datapointIds = body.datapointIds;

  if (!datapointIds) {
    throw new Error("At least one Datapoint ID is required");
  }

  await deleteDatapoints({
    projectId: params.projectId,
    datasetId: params.datasetId,
    datapointIds,
  });

  return { message: "datasetDatapoints deleted successfully" };
});
