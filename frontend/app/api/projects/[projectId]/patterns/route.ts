import { NextRequest, NextResponse } from "next/server";

import { getClusters } from "@/lib/actions/clusters";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
): Promise<NextResponse> {
  try {
    const { projectId } = await params;

    const clusters = await getClusters(projectId);

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

