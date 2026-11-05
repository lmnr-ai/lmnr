import { createDatapointVersionFromExisting, listDatapointVersions } from "@/lib/actions/datapoints/versions";
import { apiHandler } from "@/lib/api/api-handler";
import { withAudit } from "@/lib/audit";

/**
 * GET - List all versions of a specific datapoint
 */
export const GET = apiHandler<{ projectId: string; datasetId: string; datapointId: string }>(async (req, ctx) => {
  const params = await ctx.params;

  const versions = await listDatapointVersions({
    projectId: params.projectId,
    datasetId: params.datasetId,
    datapointId: params.datapointId,
  });

  return Response.json(versions);
});

/**
 * POST - Create a new version from an existing version
 * Body should contain: { versionCreatedAt: string }
 */
export const POST = withAudit<{ projectId: string; datasetId: string; datapointId: string }>(
  { resource: "datapoint", action: "update" },
  async (req, ctx, audit) => {
    const params = await ctx.params;

    const body = await req.json();

    const result = await createDatapointVersionFromExisting({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
      versionCreatedAt: body.versionCreatedAt,
    });
    await audit.target(params.datapointId, { parent: { datasetId: params.datasetId } });

    return Response.json(result, { status: 200 });
  }
);
