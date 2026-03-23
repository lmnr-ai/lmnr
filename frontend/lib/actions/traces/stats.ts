import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { GetTracesSchema } from "@/lib/actions/traces";
import { searchSpans } from "@/lib/actions/traces/search";
import { buildTracesStatsWhereConditions, generateEmptyTimeBuckets } from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";

export const GetTraceStatsSchema = GetTracesSchema.omit({
  pageNumber: true,
  pageSize: true,
}).extend({
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
  searchTraceIds: z.array(z.string()).optional(),
});

export type TracesStatsDataPoint = {
  timestamp: string;
  successCount: number;
  errorCount: number;
} & Record<string, number>;

export async function getTraceStats(
  input: z.infer<typeof GetTraceStatsSchema>
): Promise<{ items: TracesStatsDataPoint[] }> {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    traceType,
    search,
    searchIn,
    filter: inputFilters,
    intervalValue,
    intervalUnit,
    searchTraceIds,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  // Use pre-computed searchTraceIds if provided to avoid duplicate search calls.
  // Otherwise fall back to calling searchSpans directly.
  const traceIds: string[] = searchTraceIds
    ? searchTraceIds
    : search
      ? [
          ...new Set(
            (
              await searchSpans({
                projectId,
                traceId: undefined,
                searchQuery: search,
                timeRange: getTimeRange(pastHours, startTime, endTime),
                searchType: searchIn as SpanSearchType[],
              })
            ).map((span) => span.trace_id)
          ),
        ]
      : [];

  if ((search || searchTraceIds) && traceIds?.length === 0) {
    const timeRange = getTimeRange(pastHours, startTime, endTime);
    const items = generateEmptyTimeBuckets(timeRange);
    return { items };
  }

  const { conditions: whereConditions, params: whereParams } = buildTracesStatsWhereConditions({
    traceType,
    traceIds,
    filters,
  });

  const {
    condition: timeCondition,
    params: timeParams,
    fillFrom,
    fillTo,
  } = buildTimeRangeWithFill({
    startTime,
    endTime,
    pastHours,
    timeColumn: "start_time",
    intervalValue,
    intervalUnit,
  });

  const allConditions = [...whereConditions];
  if (timeCondition) {
    allConditions.push(timeCondition);
  }

  const withFillClause =
    fillFrom && fillTo
      ? `WITH FILL
    FROM ${fillFrom}
    TO ${fillTo}
    STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  const query = `
    SELECT 
      toStartOfInterval(start_time, toInterval({intervalValue:UInt32}, {intervalUnit:String})) as timestamp,
      countIf(status != 'error') as successCount,
      countIf(status = 'error') as errorCount
    FROM traces
    WHERE ${allConditions.join(" AND ")}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const parameters = {
    ...whereParams,
    ...timeParams,
    intervalValue,
    intervalUnit,
  };

  const items = await executeQuery<TracesStatsDataPoint>({
    query,
    parameters,
    projectId,
  });

  return { items };
}
