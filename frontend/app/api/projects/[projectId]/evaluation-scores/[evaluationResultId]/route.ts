import { type NextRequest } from "next/server";

import { getEvaluationScore, updateEvaluationScore } from "@/lib/actions/evaluation-score";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; evaluationResultId: string }>(async (req: NextRequest, ctx) => {
  const { evaluationResultId, projectId } = await ctx.params;

  const name = req.nextUrl.searchParams.get("name");

  if (!name) {
    return Response.json({ error: "Score name is required" }, { status: 400 });
  }

  const evaluationScore = await getEvaluationScore({
    evaluationResultId,
    name,
    projectId,
  });

  return Response.json(evaluationScore);
});

export const POST = apiHandler<{ projectId: string; evaluationResultId: string }>(async (req, ctx) => {
  const { evaluationResultId, projectId } = await ctx.params;

  const body = (await req.json()) as { score: number; name: string };
  const updatedEvaluationScore = await updateEvaluationScore({
    evaluationResultId,
    score: body.score,
    name: body.name,
    projectId,
  });

  return Response.json(updatedEvaluationScore);
});
