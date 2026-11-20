import { getEvalDataset } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";
import { NotFoundError } from "@/lib/api/errors";

type Params = { projectId: string; org: string; name: string };

/** The dataset and its task count. */
export const GET = apiHandler<Params>(async (_req, ctx) => {
  const { projectId, org, name } = await ctx.params;
  const dataset = await getEvalDataset(projectId, `${org}/${name}`);
  if (!dataset) {
    throw new NotFoundError("Eval dataset not found");
  }
  return Response.json(dataset);
});
