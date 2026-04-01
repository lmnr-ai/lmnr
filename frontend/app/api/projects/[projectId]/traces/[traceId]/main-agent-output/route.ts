import { type NextRequest, NextResponse } from "next/server";

import { getMainAgentIO } from "@/lib/actions/sessions/trace-io";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const { input, output } = await getMainAgentIO({ traceId, projectId });

    return NextResponse.json({ input, output });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch main agent IO" },
      { status: 500 }
    );
  }
}
