import { getEvaluationTaskVersions } from "@/lib/actions/evaluation/task-versions";
import { apiHandler } from "@/lib/api/api-handler";

/** The pushed task versions of the evaluation's dataset, for linking its Task column. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (_req, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  return Response.json(await getEvaluationTaskVersions(projectId, evaluationId));
});
