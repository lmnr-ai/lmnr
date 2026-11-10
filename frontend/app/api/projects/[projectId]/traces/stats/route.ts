import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceStats, GetTraceStatsSchema } from "@/lib/actions/traces/stats";
import { generateEmptyTimeBuckets } from "@/lib/actions/traces/utils.ts";
import { apiHandler } from "@/lib/api/api-handler";
import { getOptionalTimeRange } from "@/lib/clickhouse/utils.ts";

export const GET = apiHandler<{ projectId: string }>(async (req, ctx) => {
  const params = await ctx.params;
  const projectId = params.projectId;

  const parseResult = parseUrlParams(req.nextUrl.searchParams, GetTraceStatsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    const timeRange = getOptionalTimeRange(
      req.nextUrl.searchParams.get("pastHours") ?? undefined,
      req.nextUrl.searchParams.get("startTime") ?? undefined,
      req.nextUrl.searchParams.get("endTime") ?? undefined
    ) ?? { pastHours: 24 };
    const items = generateEmptyTimeBuckets(timeRange);
    return Response.json({ items });
  }

  const result = await getTraceStats({ ...parseResult.data, projectId });
  return Response.json(result);
});
