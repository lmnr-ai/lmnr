import { NextRequest, NextResponse } from "next/server";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { getEvaluationTimeProgression } from "@/lib/clickhouse/evaluation-scores";
import { AggregationFunction, TimeRange } from "@/lib/clickhouse/utils";


export const GET = async (request: NextRequest, { params }: { params: { projectId: string, groupId: string } }) => {
  const { projectId, groupId } = params;
  let timeRange: TimeRange;
  if (request.nextUrl.searchParams.get('pastHours')) {
    const pastHours = parseInt(request.nextUrl.searchParams.get('pastHours') ?? '0');
    timeRange = { pastHours };
  } else if (request.nextUrl.searchParams.get('startDate') && request.nextUrl.searchParams.get('endDate')) {
    const startDate = new Date(request.nextUrl.searchParams.get('startDate') ?? '');
    const endDate = new Date(request.nextUrl.searchParams.get('endDate') ?? '');
    timeRange = { start: startDate, end: endDate };
  } else {
    timeRange = { pastHours: 'all' };
  }

  const aggregationFunction = (request.nextUrl.searchParams.get('aggregate') ?? 'AVG') as AggregationFunction;

  const progression = await getEvaluationTimeProgression(
    clickhouseClient,
    projectId,
    groupId,
    timeRange,
    aggregationFunction
  );

  return NextResponse.json(progression);
};
