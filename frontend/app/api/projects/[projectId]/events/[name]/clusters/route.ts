import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventClusters } from "@/lib/actions/clusters";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; name: string }> }
): Promise<NextResponse> {
  try {
    const { projectId, name: eventName } = await params;

    const result = await getEventClusters({
      projectId,
      eventName,
    });

    return NextResponse.json(result);
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
