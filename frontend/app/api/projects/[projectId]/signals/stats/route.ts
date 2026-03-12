import { type NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSignalsStats } from "@/lib/actions/signals/stats";

export async function GET(request: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await props.params;

  const signalIds = request.nextUrl.searchParams.getAll("signalId");
  const scale = request.nextUrl.searchParams.get("scale") || "day";

  if (signalIds.length === 0) {
    return NextResponse.json({ error: "At least one signalId is required" }, { status: 400 });
  }

  try {
    const validScales = ["day", "week", "month"] as const;
    const validatedScale = validScales.includes(scale as (typeof validScales)[number])
      ? (scale as (typeof validScales)[number])
      : "day";
    const result = await getSignalsStats({ projectId, signalIds, scale: validatedScale });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch signal stats." },
      { status: 500 }
    );
  }
}
