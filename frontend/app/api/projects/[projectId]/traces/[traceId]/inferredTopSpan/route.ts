import { NextRequest, NextResponse } from "next/server";

import { getInferredTopSpan } from "@/lib/actions/trace";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    const result = await getInferredTopSpan({ traceId, projectId });

    if (!result) {
      return NextResponse.json({ inferredTopSpanName: null }, { status: 200 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching inferred top span:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to fetch inferred top span",
      },
      { status: 500 }
    );
  }
}

