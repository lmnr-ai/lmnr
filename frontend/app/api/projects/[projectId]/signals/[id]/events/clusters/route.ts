import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventClusters, GetEventClustersSchema } from "@/lib/actions/clusters";
import { parseUrlParams } from "@/lib/actions/common/utils";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, id: signalId } = await params;

    const parseResult = parseUrlParams(
      req.nextUrl.searchParams,
      GetEventClustersSchema.omit({ projectId: true, signalId: true })
    );

    if (!parseResult.success) {
      return NextResponse.json({ error: prettifyError(parseResult.error) }, { status: 400 });
    }

    const result = await getEventClusters({ ...parseResult.data, projectId, signalId });

    return NextResponse.json({
      items: result.items,
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
