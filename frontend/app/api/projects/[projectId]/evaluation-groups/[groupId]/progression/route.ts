import { type NextRequest, NextResponse } from "next/server";

import { getEvaluationTimeProgression } from "@/lib/actions/evaluation/scores";
import { type AggregationFunction } from "@/lib/clickhouse/types";

export const GET = async (request: NextRequest, props: { params: Promise<{ projectId: string; groupId: string }> }) => {
  const params = await props.params;
  const { projectId, groupId } = params;

  const ids = request.nextUrl.searchParams.getAll("id");

  const aggregationFunction = (request.nextUrl.searchParams.get("aggregate") ?? "AVG") as AggregationFunction;

  const progression = await getEvaluationTimeProgression(projectId, groupId, aggregationFunction, ids);

  return NextResponse.json(progression);
};
