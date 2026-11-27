import { getTaskVersionFiles } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; org: string; name: string; taskOrg: string; taskName: string; hash: string };

/** The files of a pushed task version, paths relative to the task dir. */
export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, org, name, taskOrg, taskName, hash } = await ctx.params;
  return Response.json(await getTaskVersionFiles(projectId, `${org}/${name}`, `${taskOrg}/${taskName}`, hash));
});
