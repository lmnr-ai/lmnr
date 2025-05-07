import { NextRequest, NextResponse } from "next/server";

import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { getLabelMetricsOverTime } from "@/lib/clickhouse/spans";
import { getTimeRange } from "@/lib/clickhouse/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const { projectId } = params;
    const searchParams = req.nextUrl.searchParams;

    const groupByInterval = (searchParams.get("groupByInterval") as GroupByInterval) || "hour";
    const pastHours = searchParams.get("pastHours") as string | undefined;
    const startDate = searchParams.get("startDate") as string | undefined;
    const endDate = searchParams.get("endDate") as string | undefined;

    const timeRange = getTimeRange(pastHours, startDate, endDate);

    const metrics = await getLabelMetricsOverTime(projectId, groupByInterval, timeRange);

    return NextResponse.json(metrics);
  } catch (error) {
    return NextResponse.json({ error: "Failed to calculate label metrics" }, { status: 500 });
  }
}
