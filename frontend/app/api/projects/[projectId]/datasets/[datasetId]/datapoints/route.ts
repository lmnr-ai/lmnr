import { parseUrlParams } from "@/lib/actions/common/utils";
import {
  createDatapoints,
  CreateDatapointsSchema,
  deleteDatapoints,
  getDatapoints,
  ListDatapointsSchema,
} from "@/lib/actions/datapoints";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

type Params = { projectId: string; datasetId: string };

export const GET = apiHandler<Params>(async (req, ctx) => {
  const { projectId, datasetId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    ListDatapointsSchema.omit({ projectId: true, datasetId: true })
  );

  if (!parseResult.success) {
    return Response.json({ items: [] });
  }

  return Response.json(await getDatapoints({ ...parseResult.data, projectId, datasetId }));
});

export const POST = withAudit<Params>({ resource: "datapoint", action: "create" }, async (req, ctx, audit) => {
  const { projectId, datasetId } = await ctx.params;
  const body = await req.json();

  const parseResult = CreateDatapointsSchema.safeParse(body);
  if (!parseResult.success) {
    return Response.json({ error: "Invalid request body", details: parseResult.error.issues }, { status: 400 });
  }

  const { datapoints, sourceSpanId } = parseResult.data;

  const result = await createDatapoints({ projectId, datasetId, datapoints, sourceSpanId });
  await audit.target(
    result.map((datapoint) => datapoint.id),
    { parent: { datasetId } }
  );

  return Response.json(result);
});

// Note: this endpoint allows a body in a DELETE request, which is not standard
// but fits our purposes: (1) this is an internal API, (2) passing many
// datapoint IDs in the URL may break
export const DELETE = withAudit<Params>({ resource: "datapoint", action: "delete" }, async (req, ctx, audit) => {
  const { projectId, datasetId } = await ctx.params;
  const { datapointIds } = await req.json();

  if (!datapointIds) {
    return Response.json({ error: "At least one Datapoint ID is required" }, { status: 400 });
  }

  await audit.target(datapointIds, { parent: { datasetId } });
  await deleteDatapoints({ projectId, datasetId, datapointIds });

  return new Response("datasetDatapoints deleted successfully", { status: 200 });
});
