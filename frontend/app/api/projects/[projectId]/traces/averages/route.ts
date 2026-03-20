import { type NextRequest, NextResponse } from "next/server";

import { getTraceAverages } from "@/lib/actions/trace/averages";

export async function GET(_req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;

  try {
    const averages = await getTraceAverages({ projectId });
    return NextResponse.json(averages);
  } catch (error) {
    console.error("Error fetching trace averages:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch averages",
      },
      { status: 500 }
    );
  }
}
