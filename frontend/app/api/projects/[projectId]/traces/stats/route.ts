import { parseUrlParams } from "@/lib/actions/common/utils";
import { getTraceStats, GetTraceStatsSchema } from "@/lib/actions/traces/stats";
import { generateEmptyTimeBuckets } from "@/lib/actions/traces/utils.ts";
import { handleRoute } from "@/lib/api/route-handler";
import { getOptionalTimeRange } from "@/lib/clickhouse/utils.ts";

export const GET = handleRoute<{ projectId: string }, unknown>(async (req, params) => {
  const { projectId } = params;
  const searchParams = new URL(req.url).searchParams;

  const parseResult = parseUrlParams(searchParams, GetTraceStatsSchema.omit({ projectId: true }));

  if (!parseResult.success) {
    const timeRange = getOptionalTimeRange(
      searchParams.get("pastHours") ?? undefined,
      searchParams.get("startTime") ?? undefined,
      searchParams.get("endTime") ?? undefined
    ) ?? { pastHours: 24 };
    const items = generateEmptyTimeBuckets(timeRange);
    return { items };
  }

  return await getTraceStats({ ...parseResult.data, projectId });
});
