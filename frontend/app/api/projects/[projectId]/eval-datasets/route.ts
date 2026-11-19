import { getEvalDatasets } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (_req, ctx) => {
  const { projectId } = await ctx.params;
  return Response.json(await getEvalDatasets(projectId));
});
