import { createDatapointVersionFromExisting, listDatapointVersions } from "@/lib/actions/datapoints/versions";
import { handleRoute } from "@/lib/api/route-handler";

/**
 * GET - List all versions of a specific datapoint
 */
export const GET = handleRoute<{ projectId: string; datasetId: string; datapointId: string }, unknown>(
  async (_req, params) =>
    await listDatapointVersions({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
    })
);

/**
 * POST - Create a new version from an existing version
 * Body should contain: { versionCreatedAt: string }
 */
export const POST = handleRoute<{ projectId: string; datasetId: string; datapointId: string }, unknown>(
  async (req, params) => {
    const body = await req.json();

    return await createDatapointVersionFromExisting({
      projectId: params.projectId,
      datasetId: params.datasetId,
      datapointId: params.datapointId,
      versionCreatedAt: body.versionCreatedAt,
    });
  }
);
