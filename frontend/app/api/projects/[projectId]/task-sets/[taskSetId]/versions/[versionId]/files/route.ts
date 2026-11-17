import { getTaskSetVersionPrefix } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";
import { listArchive } from "@/lib/hosted-evals/archive";

/** The files of one version of the task set, paths relative to its root. */
export const GET = apiHandler<{ projectId: string; taskSetId: string; versionId: string }>(async (_req, ctx) => {
  const { projectId, taskSetId, versionId } = await ctx.params;
  return Response.json({ files: await listArchive(await getTaskSetVersionPrefix(projectId, taskSetId, versionId)) });
});
