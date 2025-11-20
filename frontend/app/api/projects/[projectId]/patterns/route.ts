import { NextRequest, NextResponse } from "next/server";
import { prettifyError } from "zod/v4";

import { getClusters, GetClustersSchema } from "@/lib/actions/clusters";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { projectId } = await params;

    const parseResult = parseUrlParams(req.nextUrl.searchParams, GetClustersSchema.omit({ projectId: true }), [
      "filter",
    ]);

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const clusters = await getClusters({
      ...parseResult.data,
      projectId,
    });

    // Transform all clusters to table format
    const allPatterns = clusters.map((cluster) => ({
      id: cluster.id,
      clusterId: cluster.id,
      name: cluster.name,
      level: cluster.level,
      parentId: cluster.parentId,
      numChildrenClusters: cluster.numChildrenClusters,
      numTraces: cluster.numTraces,
      createdAt: cluster.createdAt,
      updatedAt: cluster.updatedAt,
    }));

    return NextResponse.json({ items: allPatterns });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
