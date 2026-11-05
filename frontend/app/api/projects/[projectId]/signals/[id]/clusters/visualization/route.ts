import { prettifyError } from "zod/v4";

import { getClusterVisualization, GetClusterVisualizationSchema } from "@/lib/actions/cluster-visualization";
import { parseUrlParams } from "@/lib/actions/common/utils";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; id: string }>(async (req, ctx) => {
  const { projectId, id: signalId } = await ctx.params;
  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    GetClusterVisualizationSchema.omit({ projectId: true, signalId: true })
  );

  if (!parseResult.success) {
    return Response.json({ error: prettifyError(parseResult.error) }, { status: 400 });
  }

  return Response.json(await getClusterVisualization({ ...parseResult.data, projectId, signalId }));
});
