import { prettifyError } from "zod/v4";

import { getClusterEventCounts, GetClusterEventCountsSchema } from "@/lib/actions/clusters";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetClusterEventCountsSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  const result = await getClusterEventCounts({ ...parseResult.data, projectId, signalId });
  return Response.json(result);
});
