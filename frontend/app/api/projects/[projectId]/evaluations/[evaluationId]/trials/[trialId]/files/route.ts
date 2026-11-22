import { getTrialFiles } from "@/lib/actions/evaluation/trial-files";
import { apiHandler } from "@/lib/api/api-handler";

/** The trial's Files panel listing: `task/`, `agent/` and `logs/`, resolved from the trial's own row. */
export const GET = apiHandler<{ projectId: string; evaluationId: string; trialId: string }>(async (_req, ctx) => {
  const { projectId, evaluationId, trialId } = await ctx.params;
  return Response.json(await getTrialFiles(projectId, evaluationId, trialId));
});
