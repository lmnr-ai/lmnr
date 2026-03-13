import { getEvaluationScore, updateEvaluationScore } from "@/lib/actions/evaluation-score";
import { handleRoute } from "@/lib/api/route-handler";

export const GET = handleRoute<{ projectId: string; evaluationResultId: string }, unknown>(async (req, params) => {
  const { evaluationResultId, projectId } = params;
  const url = new URL(req.url);

  const name = url.searchParams.get("name");

  if (!name) {
    throw new Error("Score name is required");
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
