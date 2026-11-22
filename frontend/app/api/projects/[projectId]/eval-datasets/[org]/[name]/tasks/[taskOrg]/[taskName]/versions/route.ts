import { getEvalTaskVersions } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; org: string; name: string; taskOrg: string; taskName: string };

/** Every version of one task, newest first. */
export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, org, name, taskOrg, taskName } = await ctx.params;
  return Response.json(await getEvalTaskVersions(projectId, `${org}/${name}`, `${taskOrg}/${taskName}`));
});
