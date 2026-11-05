import { parseUrlParams } from "@/lib/actions/common/utils";
import { countDatapoints, CountDatapointsSchema } from "@/lib/actions/datapoints";
import { apiHandler } from "@/lib/api/api-handler";

export const GET = apiHandler<{ projectId: string; datasetId: string }>(async (req, ctx) => {
  const { projectId, datasetId } = await ctx.params;

  const parseResult = parseUrlParams(
    req.nextUrl.searchParams,
    CountDatapointsSchema.omit({ projectId: true, datasetId: true })
  );

  if (!parseResult.success) {
    return Response.json({ totalCount: 0 });
  }

  return Response.json(await countDatapoints({ ...parseResult.data, projectId, datasetId }));
});
