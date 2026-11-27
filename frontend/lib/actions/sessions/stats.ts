import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { GetSessionsSchema } from "@/lib/actions/sessions";
import { resolveSessionSearch } from "@/lib/actions/sessions/search";
import { buildSessionsQueryWithParams } from "@/lib/actions/sessions/utils";
import { executeQuery } from "@/lib/actions/sql";
import { generateEmptyTimeBuckets, parseCustomColumnsJson } from "@/lib/actions/traces/utils";
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

export type SessionsStatsDataPoint = { timestamp: string; count: number } & Record<string, number>;

/**
 * Sessions per time bucket, keyed by each session's first trace. Reuses the list query so filters,
 * search and custom columns match the table.
 */
export async function getSessionStats(
  input: z.infer<typeof GetSessionStatsSchema>
): Promise<{ items: SessionsStatsDataPoint[] }> {
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

  const { traceIds, noMatches } = await resolveSessionSearch({
    projectId,
    search,
    searchIn,
    pastHours,
    startTime,
    endTime,
  });

  if (noMatches) {
    const buckets = generateEmptyTimeBuckets(getTimeRange(pastHours, startTime, endTime));
    return { items: buckets.map(({ timestamp }) => ({ timestamp, count: 0 }) as SessionsStatsDataPoint) };
  }

  const { query: sessionsQuery, parameters: sessionsParams } = buildSessionsQueryWithParams({
    columns: ["MIN(start_time) as sessionStart"],
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
      count() as count
    FROM (${sessionsQuery})
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<SessionsStatsDataPoint>({
    query,
    parameters: { ...sessionsParams, ...fillParams, intervalValue, intervalUnit },
    projectId,
  });

  return { items };
}
