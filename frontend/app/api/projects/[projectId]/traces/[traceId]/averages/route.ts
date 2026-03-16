import { type NextRequest, NextResponse } from "next/server";

import { getTraceSpanAverages } from "@/lib/actions/trace/averages";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    const averages = await getTraceSpanAverages({ traceId, projectId });
    return NextResponse.json(averages);
  } catch (error) {
    console.error("Error fetching trace span averages:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch averages",
      },
      { status: 500 }
    );
  }
}
