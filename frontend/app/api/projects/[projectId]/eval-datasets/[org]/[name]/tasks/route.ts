import { type NextRequest } from "next/server";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { evalListParamsSchema, getEvalDatasetTasks } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

type Params = { projectId: string; org: string; name: string };

/** One page of the dataset's tasks. */
export const GET = apiHandler<Params>(async (req: NextRequest, ctx) => {
  const { projectId, org, name } = await ctx.params;
  const params = parseUrlParams(req.nextUrl.searchParams, evalListParamsSchema);
  if (!params.success) throw params.error;
  return Response.json(await getEvalDatasetTasks(projectId, `${org}/${name}`, params.data));
});
