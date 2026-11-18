import { getTaskVersions } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

/** Every pushed version of the task, newest first. */
export const GET = apiHandler<{ projectId: string; datasetName: string; taskName: string }>(async (_req, ctx) => {
  const { projectId, datasetName, taskName } = await ctx.params;
  return Response.json(await getTaskVersions({ projectId, datasetName, taskName }));
});
