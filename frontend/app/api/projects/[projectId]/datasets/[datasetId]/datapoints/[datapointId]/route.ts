import { getDatapoint, updateDatapoint } from "@/lib/actions/datapoint";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; datasetId: string; datapointId: string };

export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, datasetId, datapointId } = await ctx.params;
  return Response.json(await getDatapoint({ projectId, datapointId, datasetId }));
});

export const POST = apiHandler<Params>(async (req, ctx) => {
  const { projectId, datasetId, datapointId } = await ctx.params;
  const body = await req.json();

  await updateDatapoint({
    projectId,
    datapointId,
    datasetId,
    data: body.data,
    target: body.target,
    metadata: body.metadata,
    createdAt: body.createdAt,
  });

  return Response.json({ success: true });
});
