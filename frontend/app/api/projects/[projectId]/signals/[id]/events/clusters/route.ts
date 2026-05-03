import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventClusters } from "@/lib/actions/clusters";
import { hasClusteringAccessForProject } from "@/lib/actions/usage/utils";
import { PAYWALL_CLUSTER_NAME } from "@/lib/features/clustering";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, id: signalId } = await params;

    const [result, hasAccess] = await Promise.all([
      getEventClusters({ projectId, signalId }),
      hasClusteringAccessForProject(projectId),
    ]);

    const items = hasAccess ? result.items : result.items.map((item) => ({ ...item, name: PAYWALL_CLUSTER_NAME }));

    return NextResponse.json({
      items,
      totalEventCount: result.totalEventCount,
      clusteredEventCount: result.clusteredEventCount,
    });
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
