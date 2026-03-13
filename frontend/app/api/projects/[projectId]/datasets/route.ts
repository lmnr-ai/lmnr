import { parseUrlParams } from "@/lib/actions/common/utils";
import { createDataset, deleteDatasets, getDatasets, getDatasetsSchema } from "@/lib/actions/datasets";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const POST = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const body = await req.json();
  const { name } = body;

  return await createDataset({ name, projectId: params.projectId });
});

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);

  const parseResult = parseUrlParams(searchParams, getDatasetsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getDatasets({
    ...parseResult.data,
    projectId: params.projectId,
  });
});

export const DELETE = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { searchParams } = new URL(req.url);
  const datasetIds = searchParams.get("datasetIds")?.split(",");

  if (!datasetIds) {
    throw new HttpError("At least one Dataset ID is required", 400);
  }

  await deleteDatasets({ projectId: params.projectId, datasetIds });

  return { message: "datasets deleted successfully" };
});
