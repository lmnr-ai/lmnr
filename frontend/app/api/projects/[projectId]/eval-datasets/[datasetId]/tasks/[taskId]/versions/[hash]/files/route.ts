import { getTaskVersionFiles } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; datasetId: string; taskId: string; hash: string };

/** The files of a pushed task version, paths relative to the task dir. */
export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, datasetId, taskId, hash } = await ctx.params;
  return Response.json(await getTaskVersionFiles(projectId, datasetId, taskId, hash));
});
