import { type NextRequest, NextResponse } from "next/server";

import { getSignalsForTraceIds } from "@/lib/actions/traces";

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    const signalsByTrace = await getSignalsForTraceIds(projectId, [traceId]);
    const signals = signalsByTrace.get(traceId) ?? [];
    return NextResponse.json(signals);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signals for trace." },
      { status: 500 }
    );
  }
}
