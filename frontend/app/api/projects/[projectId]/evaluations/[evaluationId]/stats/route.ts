import { parseUrlParams } from "@/lib/actions/common/utils";
import { getEvaluationStatistics, GetEvaluationStatisticsSchema } from "@/lib/actions/evaluation";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; evaluationId: string }, unknown>(async (req, params) => {
  const { projectId, evaluationId } = params;
  const url = new URL(req.url);

  const parseResult = parseUrlParams(
    url.searchParams,
    GetEvaluationStatisticsSchema.omit({ evaluationId: true, projectId: true })
  );

  if (!parseResult.success) {
    throw parseResult.error;
  }

  return await getEvaluationStatistics({
    ...parseResult.data,
    projectId,
    evaluationId,
  });
});
