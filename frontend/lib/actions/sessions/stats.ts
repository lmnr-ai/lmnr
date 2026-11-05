import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { GetSessionsSchema } from "@/lib/actions/sessions";
import { buildSessionsQueryWithParams } from "@/lib/actions/sessions/utils";
import { executeQuery } from "@/lib/actions/sql";
import { searchSpans } from "@/lib/actions/traces/search";
import { type TracesStatsDataPoint } from "@/lib/actions/traces/stats-types";
import { generateEmptyTimeBuckets, parseCustomColumnsJson } from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";

export const GetSessionStatsSchema = GetSessionsSchema.omit({
  pageNumber: true,
  pageSize: true,
  sortColumn: true,
  sortDirection: true,
}).extend({
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

/**
 * Sessions per time bucket, keyed by each session's first trace. A session counts as an error
 * when any of its traces errored. Reuses the list query so filters, search and custom columns match the table.
 */
export async function getSessionStats(
  input: z.infer<typeof GetSessionStatsSchema>
): Promise<{ items: TracesStatsDataPoint[] }> {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    search,
    searchIn,
    filter: inputFilters,
    intervalValue,
    intervalUnit,
    customColumns: customColumnsJson,
  } = input;

  const filters: Filter[] = compact(inputFilters);
  const customColumns = parseCustomColumnsJson(customColumnsJson) ?? [];

  const traceIds = search
    ? [
        ...new Set(
          (
            await searchSpans({
              projectId,
              searchQuery: search,
              timeRange: getTimeRange(pastHours, startTime, endTime),
              searchType: searchIn as SpanSearchType[],
            })
          ).map((hit) => hit.trace_id)
        ),
      ]
    : [];

  if (search && traceIds.length === 0) {
    return { items: generateEmptyTimeBuckets(getTimeRange(pastHours, startTime, endTime)) };
  }

  const { query: sessionsQuery, parameters: sessionsParams } = buildSessionsQueryWithParams({
    columns: ["MIN(start_time) as sessionStart", "countIf(status = 'error') > 0 as hasError"],
    traceIds,
    filters,
    startTime,
    endTime,
    pastHours,
    customColumns,
  });

  const {
    params: fillParams,
    fillFrom,
    fillTo,
  } = buildTimeRangeWithFill({
    startTime,
    endTime,
    pastHours,
    intervalValue,
    intervalUnit,
  });

  const withFillClause =
    fillFrom && fillTo
      ? `WITH FILL FROM ${fillFrom} TO ${fillTo} STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  const query = `
    SELECT
      toStartOfInterval(sessionStart, toInterval({intervalValue:UInt32}, {intervalUnit:String})) as timestamp,
      countIf(NOT hasError) as successCount,
      countIf(hasError) as errorCount
    FROM (${sessionsQuery})
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<TracesStatsDataPoint>({
    query,
    parameters: { ...sessionsParams, ...fillParams, intervalValue, intervalUnit },
    projectId,
  });

  return { items };
}
