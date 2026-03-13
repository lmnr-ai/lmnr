import { getEvaluationScore, updateEvaluationScore } from "@/lib/actions/evaluation-score";
import { handleRoute,HttpError } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; evaluationResultId: string }, unknown>(async (req, params) => {
  const { evaluationResultId, projectId } = params;
  const url = new URL(req.url);

  const name = url.searchParams.get("name");

  if (!name) {
    throw new HttpError("Score name is required", 400);
  }

  return await getEvaluationScore({
    evaluationResultId,
    name,
    projectId,
  });
});

export const POST = handleRoute<{ projectId: string; evaluationResultId: string }, unknown>(async (req, params) => {
  const { evaluationResultId, projectId } = params;

  const body = (await req.json()) as { score: number; name: string };

  return await updateEvaluationScore({
    evaluationResultId,
    score: body.score,
    name: body.name,
    projectId,
  });
});
