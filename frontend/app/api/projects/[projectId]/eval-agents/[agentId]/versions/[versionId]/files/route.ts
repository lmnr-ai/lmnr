import { getAgentVersionPrefix } from "@/lib/actions/task-sets";
import { apiHandler } from "@/lib/api/api-handler";
import { listArchive } from "@/lib/hosted-evals/archive";

/** The files of one version of the agent's scripts, paths relative to the agent dir. */
export const GET = apiHandler<{ projectId: string; agentId: string; versionId: string }>(async (_req, ctx) => {
  const { projectId, agentId, versionId } = await ctx.params;
  return Response.json({ files: await listArchive(await getAgentVersionPrefix(projectId, agentId, versionId)) });
});
