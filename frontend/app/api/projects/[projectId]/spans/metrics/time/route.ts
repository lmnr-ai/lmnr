import { NextRequest, NextResponse } from "next/server";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { GroupByInterval } from "@/lib/clickhouse/modifiers";
import { getSpanMetricsOverTime, SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/spans";
import { AggregationFunction, getTimeRange } from "@/lib/clickhouse/utils";

export async function GET(req: NextRequest, { params }: { params: { projectId: string } }) {
  const { projectId } = params;
  const searchParams = req.nextUrl.searchParams;

  const metric = searchParams.get('metric') as SpanMetric;
  const aggregation = searchParams.get('aggregation') as AggregationFunction;
  const groupByInterval = searchParams.get('groupByInterval') as GroupByInterval;
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;
  const groupBy = searchParams.get('groupBy') as SpanMetricGroupBy;

  const timeRange = getTimeRange(pastHours, startDate, endDate);

  const metrics = await getSpanMetricsOverTime(
    clickhouseClient,
    projectId,
    metric,
    groupByInterval,
    timeRange,
    groupBy,
    aggregation
  );

  return NextResponse.json(metrics);
}
