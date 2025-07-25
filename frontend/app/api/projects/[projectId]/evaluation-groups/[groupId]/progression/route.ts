import { NextRequest, NextResponse } from "next/server";

import { getEvaluationTimeProgression } from "@/lib/clickhouse/evaluation-scores";
import { AggregationFunction } from "@/lib/clickhouse/types";
import { TimeRange } from "@/lib/clickhouse/utils";

export const GET = async (request: NextRequest, props: { params: Promise<{ projectId: string; groupId: string }> }) => {
  const params = await props.params;
  const { projectId, groupId } = params;

  const ids = request.nextUrl.searchParams.getAll("id");
  let timeRange: TimeRange;
  if (request.nextUrl.searchParams.get("pastHours")) {
    const pastHours = parseInt(request.nextUrl.searchParams.get("pastHours") ?? "0");
    timeRange = { pastHours };
  } else if (request.nextUrl.searchParams.get("startDate") && request.nextUrl.searchParams.get("endDate")) {
    const startDate = new Date(request.nextUrl.searchParams.get("startDate") ?? "");
    const endDate = new Date(request.nextUrl.searchParams.get("endDate") ?? "");
    timeRange = { start: startDate, end: endDate };
  } else {
    timeRange = { pastHours: "all" };
  }

  const aggregationFunction = (request.nextUrl.searchParams.get("aggregate") ?? "AVG") as AggregationFunction;

  const progression = await getEvaluationTimeProgression(projectId, groupId, timeRange, aggregationFunction, ids);

  return NextResponse.json(progression);
};
