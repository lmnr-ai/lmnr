import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanMetricsOverTimeAction } from "@/lib/actions/dashboard";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { AggregationFunction, SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const { projectId } = params;
    const searchParams = req.nextUrl.searchParams;

    const metric: SpanMetric | null = searchParams.get("metric") as SpanMetric;
    const aggregation: AggregationFunction | null = searchParams.get("aggregation") as AggregationFunction;
    const groupByInterval: GroupByInterval | null = (searchParams.get("groupByInterval") as GroupByInterval) || "hour";
    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const groupBy = searchParams.get("groupBy") as SpanMetricGroupBy;

    const metrics = await getSpanMetricsOverTimeAction({
      projectId,
      metric,
      aggregation,
      groupByInterval,
      groupBy,
      pastHours,
      startDate,
      endDate,
    });

    return NextResponse.json(metrics);
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: prettifyError(error) }, { status: 400 });
    }
    return NextResponse.json({ error: "Failed to get span metrics over time" }, { status: 500 });
  }
}
