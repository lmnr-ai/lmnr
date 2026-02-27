import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getEventClusters } from "@/lib/actions/clusters";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; id: string }> }
): Promise<NextResponse> {
  try {
    const { projectId } = await params;
    const eventName = req.nextUrl.searchParams.get("eventName");

    if (!eventName) {
      return NextResponse.json({ error: "eventName is required" }, { status: 400 });
    }

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
