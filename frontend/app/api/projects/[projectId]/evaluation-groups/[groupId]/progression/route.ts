import { handleRoute } from "@/lib/api/route-handler";
import { getEvaluationTimeProgression } from "@/lib/clickhouse/evaluation-scores";
import { type AggregationFunction } from "@/lib/clickhouse/types";

export const POST = handleRoute<{ projectId: string; groupId: string }, unknown>(async (req, params) => {
  const { projectId, groupId } = params;

  const body = (await req.json()) as { ids?: string[]; aggregate?: string };
  const ids = body.ids ?? [];
  const aggregationFunction = (body.aggregate ?? "AVG") as AggregationFunction;

  return await getEvaluationTimeProgression(projectId, groupId, aggregationFunction, ids);
});
