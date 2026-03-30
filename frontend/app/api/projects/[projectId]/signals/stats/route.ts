import { type NextRequest, NextResponse } from "next/server";

import { getSignalsStats } from "@/lib/actions/signals/stats";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  const signalIds = request.nextUrl.searchParams.getAll("signalId");
  const pastHours = request.nextUrl.searchParams.get("pastHours") || "168";

  if (signalIds.length === 0) {
    return NextResponse.json({ error: "At least one signalId is required" }, { status: 400 });
  }

  try {
    const result = await getSignalsStats({ projectId, signalIds, pastHours: Number(pastHours) });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signal stats." },
      { status: 500 }
    );
  }
}
