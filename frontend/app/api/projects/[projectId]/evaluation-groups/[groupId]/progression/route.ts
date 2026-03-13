import { type NextRequest, NextResponse } from "next/server";

import { getEvaluationTimeProgression } from "@/lib/clickhouse/evaluation-scores";
import { type AggregationFunction } from "@/lib/clickhouse/types";

export const POST = async (
  request: NextRequest,
  props: { params: Promise<{ projectId: string; groupId: string }> }
) => {
  try {
    const params = await props.params;
    const { projectId, groupId } = params;

    const body = (await request.json()) as { ids?: string[]; aggregate?: string };
    const ids = body.ids ?? [];
    const aggregationFunction = (body.aggregate ?? "AVG") as AggregationFunction;

    const progression = await getEvaluationTimeProgression(projectId, groupId, aggregationFunction, ids);

    return NextResponse.json(progression);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch evaluation progression" },
      { status: 500 }
    );
  }
};
