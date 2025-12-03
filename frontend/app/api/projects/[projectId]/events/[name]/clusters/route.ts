import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventClusters, GetEventClustersSchema } from "@/lib/actions/clusters";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, name: eventName } = await params;

    const parseResult = parseUrlParams(req.nextUrl.searchParams, GetEventClustersSchema.omit({ projectId: true, eventName: true }));

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const { items: clusters } = await getEventClusters({
      ...parseResult.data,
      projectId,
      eventName,
    });

    const allClusters = clusters.map((cluster) => ({
      id: cluster.id,
      clusterId: cluster.id,
      name: cluster.name,
      level: cluster.level,
      parentId: cluster.parentId,
      numChildrenClusters: cluster.numChildrenClusters,
      numEvents: cluster.numEvents,
      createdAt: cluster.createdAt,
      updatedAt: cluster.updatedAt,
    }));

    return NextResponse.json({ items: allClusters });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ success: false, error: prettifyError(error) }, { status: 400 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get clusters. Please try again." },
      { status: 500 }
    );
  }
}

