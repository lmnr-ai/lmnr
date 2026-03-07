import { type NextRequest } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getClusterStats, GetClusterStatsSchema } from "@/lib/actions/clusters/stats";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; id: string }> }
): Promise<Response> {
  const { projectId, id: signalId } = await props.params;

  const clusterIds = req.nextUrl.searchParams.getAll("clusterId");

  if (clusterIds.length === 0) {
    return Response.json({ error: "At least one clusterId is required" }, { status: 400 });
  }

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetClusterStatsSchema.omit({ projectId: true, signalId: true, clusterIds: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  try {
    const result = await getClusterStats({ ...parseResult.data, projectId, signalId, clusterIds });
    return Response.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json({ error: prettifyError(error) }, { status: 400 });
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "Failed to fetch cluster stats." },
      { status: 500 }
    );
  }
}
