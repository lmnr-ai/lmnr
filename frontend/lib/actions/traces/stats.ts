import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { GetTracesSchema } from "@/lib/actions/traces";
import { searchSpans } from "@/lib/actions/traces/search";
import {
  buildTracesStatsWhereConditions,
  type CustomColumn,
  generateEmptyTimeBuckets,
} from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";

export const GetTraceStatsSchema = GetTracesSchema.omit({
  pageNumber: true,
  pageSize: true,
}).extend({
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
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
    customColumns: customColumnsJson,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  // Parse and validate custom columns from JSON
  let customColumns: CustomColumn[] | undefined;
  if (customColumnsJson) {
    try {
      const parsed = JSON.parse(customColumnsJson);
      const CustomColumnSchema = z.array(
        z.object({
          id: z.string().min(1),
          sql: z.string().min(1),
          filterSql: z.string().optional(),
          dbType: z.string().optional(),
        })
      );
      customColumns = CustomColumnSchema.parse(parsed);
    } catch {
      // ignore malformed custom columns
    }
  }

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
        projectId,
        traceId: undefined,
        searchQuery: search,
        timeRange: getTimeRange(pastHours, startTime, endTime),
        searchType: searchIn as SpanSearchType[],
      })
    : [];
  const traceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search && traceIds?.length === 0) {
    const timeRange = getTimeRange(pastHours, startTime, endTime);
    const items = generateEmptyTimeBuckets(timeRange);
    return { items };
  }

  const { conditions: whereConditions, params: whereParams } = buildTracesStatsWhereConditions({
    traceType,
    traceIds,
    filters,
    customColumns,
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
