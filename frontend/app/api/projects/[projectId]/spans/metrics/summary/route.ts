import { NextRequest, NextResponse } from "next/server";

import { getSpanMetricsSummary } from "@/lib/clickhouse/spans";
import { SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/types";
import { AggregationFunction, getTimeRange } from "@/lib/clickhouse/utils";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  const params = await props.params;
  const { projectId } = params;
  const searchParams = req.nextUrl.searchParams;

  const metric = searchParams.get("metric") as SpanMetric;
  const aggregation = searchParams.get("aggregation") as AggregationFunction;
  const pastHours = searchParams.get("pastHours") as string | undefined;
  const startDate = searchParams.get("startDate") as string | undefined;
  const endDate = searchParams.get("endDate") as string | undefined;
  const groupBy = searchParams.get("groupBy") as SpanMetricGroupBy;

  const timeRange = getTimeRange(pastHours, startDate, endDate);

  const metrics = await getSpanMetricsSummary(projectId, metric, timeRange, groupBy, aggregation);

  return NextResponse.json(metrics);
}
