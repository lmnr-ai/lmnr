import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getLabelMetricsAction } from "@/lib/actions/dashboard";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const { projectId } = params;
    const searchParams = req.nextUrl.searchParams;

    const groupByInterval: GroupByInterval | null = (searchParams.get("groupByInterval") as GroupByInterval) || "hour";
    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const metrics = await getLabelMetricsAction({
      projectId,
      groupByInterval,
      pastHours,
      startDate,
      endDate,
    });

    return NextResponse.json(metrics);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to calculate label metrics" }, { status: 500 });
  }
}
