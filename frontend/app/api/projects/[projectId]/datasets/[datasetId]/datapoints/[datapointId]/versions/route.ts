import { createDatapointVersionFromExisting, listDatapointVersions } from "@/lib/actions/datapoints/versions";
import { apiHandler } from "@/lib/api/api-handler";

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
export const POST = apiHandler<{ projectId: string; datasetId: string; datapointId: string }>(async (req, ctx) => {
  const params = await ctx.params;

  const body = await req.json();

  try {
    const result = await createDatapointVersionFromExisting({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
      versionCreatedAt: body.versionCreatedAt,
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof Error && error.message === "Version not found") {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }
    throw error;
  }
});
