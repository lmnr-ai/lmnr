import { getEvaluationFiles } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";

/** The files of the evals folder the evaluation's remote run uploaded. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (_req, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  return Response.json(await getEvaluationFiles(projectId, evaluationId));
});
