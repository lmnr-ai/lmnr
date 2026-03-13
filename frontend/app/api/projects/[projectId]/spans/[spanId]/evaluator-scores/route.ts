import { getEvaluatorScores } from "@/lib/actions/evaluator-scores";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; spanId: string }, unknown>(async (_req, params) => {
  const { spanId, projectId } = params;

  return await getEvaluatorScores({ spanId, projectId });
});
