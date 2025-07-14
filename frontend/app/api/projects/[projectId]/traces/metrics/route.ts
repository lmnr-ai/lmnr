import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getTraceMetricsAction, getTraceStatusMetricsAction } from "@/lib/actions/dashboard";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { AggregationFunction, TraceMetric } from "@/lib/clickhouse/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }): Promise<Response> {
  try {
    const params = await props.params;
    const { projectId } = params;
    const searchParams = req.nextUrl.searchParams;

    const metric: TraceMetric | null = searchParams.get("metric") as TraceMetric;
    const aggregation: AggregationFunction | null = searchParams.get("aggregation") as AggregationFunction;
    const groupByInterval: GroupByInterval | null = (searchParams.get("groupByInterval") as GroupByInterval) || "hour";
    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    if (!metric || !aggregation) {
      return NextResponse.json({ error: "Missing required parameters: metric and aggregation" }, { status: 400 });
    }

    const metrics =
      metric === TraceMetric.TraceStatus
        ? await getTraceStatusMetricsAction({
          projectId,
          groupByInterval,
          pastHours,
          startDate,
          endDate,
        })
        : await getTraceMetricsAction({
          projectId,
          metric,
          aggregation,
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
    return NextResponse.json({ error: "Failed to get trace metrics" }, { status: 500 });
  }
}
