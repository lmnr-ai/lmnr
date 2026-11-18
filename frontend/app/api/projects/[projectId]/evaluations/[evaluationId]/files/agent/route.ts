import { getRunAgentFiles } from "@/lib/actions/evaluation/files";
import { apiHandler } from "@/lib/api/api-handler";

/** The `agent/` dir of the dataset the evaluation's remote run uploaded. */
export const GET = apiHandler<{ projectId: string; evaluationId: string }>(async (_req, ctx) => {
  const { projectId, evaluationId } = await ctx.params;
  return Response.json(await getRunAgentFiles(projectId, evaluationId));
});
