import { type NextRequest } from "next/server";

import { parseUrlParams } from "@/lib/actions/common/utils";
import { evalListParamsSchema, getEvalDatasets } from "@/lib/actions/eval-datasets";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string }>(async (req: NextRequest, ctx) => {
  const { projectId } = await ctx.params;
  const params = parseUrlParams(req.nextUrl.searchParams, evalListParamsSchema);
  if (!params.success) throw params.error;
  return Response.json(await getEvalDatasets(projectId, params.data));
});
