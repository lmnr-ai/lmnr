import { NextRequest, NextResponse } from "next/server";
import { prettifyError, ZodError } from "zod/v4";

import { getSpanMetricsSummaryAction } from "@/lib/actions/dashboard";
import { AggregationFunction, SpanMetric, SpanMetricGroupBy } from "@/lib/clickhouse/types";

export async function GET(req: NextRequest, props: { params: Promise<{ projectId: string }> }) {
  try {
    const params = await props.params;
    const { projectId } = params;
    const searchParams = req.nextUrl.searchParams;

    const metric: SpanMetric | null = searchParams.get("metric") as SpanMetric;
    const aggregation: AggregationFunction | null = searchParams.get("aggregation") as AggregationFunction;
    const groupBy = searchParams.get("groupBy") as SpanMetricGroupBy;
    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const metrics = await getSpanMetricsSummaryAction({
      projectId,
      metric,
      aggregation,
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
    return NextResponse.json({ error: "Failed to get span metrics summary" }, { status: 500 });
  }
}
