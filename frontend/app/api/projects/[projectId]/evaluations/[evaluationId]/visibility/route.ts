import { isEvaluationPublic } from "@/lib/actions/evaluation/visibility";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; evaluationId: string }, unknown>(async (_req, params) => {
  const { evaluationId } = params;

  const isPublic = await isEvaluationPublic(evaluationId);
  return { visibility: isPublic ? "public" : "private" };
});
