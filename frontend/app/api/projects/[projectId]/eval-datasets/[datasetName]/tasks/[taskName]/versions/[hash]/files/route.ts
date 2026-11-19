import { getTaskVersionFiles } from "@/lib/actions/eval-datasets/files";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; datasetName: string; taskName: string; hash: string };

/** The files of one task version; 404 unless the project has it. */
export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, datasetName, taskName, hash } = await ctx.params;
  return Response.json(await getTaskVersionFiles({ projectId, dataset: datasetName, task: taskName, hash }));
});
