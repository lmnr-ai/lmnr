import { eq } from "drizzle-orm";
import { compact } from "lodash";
import { z } from "zod/v4";

import { Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { GetTracesSchema } from "@/lib/actions/traces";
import { searchSpans } from "@/lib/actions/traces/search";
import {buildTracesStatsWhereConditions, generateEmptyTimeBuckets} from "@/lib/actions/traces/utils";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { db } from "@/lib/db/drizzle";
import { clusters } from "@/lib/db/migrations/schema";

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
  } = input;

  const filters: Filter[] = compact(inputFilters);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
      projectId,
      traceId: undefined,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];
  let traceIds = [...new Set(spanHits.map((span) => span.trace_id))];

  if (search && traceIds?.length === 0) {
    const timeRange = getTimeRange(pastHours, startTime, endTime);
    const items = generateEmptyTimeBuckets(timeRange);
    return { items };
  }

  // Resolve pattern names to cluster IDs (lazy - only if pattern filters exist)
  let processedFilters = filters;

  const hasPatternFilter = filters.some((f) => f.column === "pattern");
  if (hasPatternFilter) {
    const clustersList = await db
      .select()
      .from(clusters)
      .where(eq(clusters.projectId, projectId));

    // Replace pattern names with cluster IDs, remove filters for non-existent patterns
    processedFilters = filters
      .map((filter) => {
        if (filter.column === "pattern") {
          const cluster = clustersList.find((c) => c.name === filter.value);
          if (cluster) {
            return { ...filter, value: cluster.id };
          } else {
            // Pattern doesn't exist - log warning and filter it out
            console.warn(`Pattern "${filter.value}" not found in clusters for project ${projectId}`);
            return null;
          }
        }
        return filter;
      })
      .filter((f): f is Filter => f !== null);
  }

  const { conditions: whereConditions, params: whereParams } = buildTracesStatsWhereConditions({
    traceType,
    traceIds,
    filters: processedFilters,
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
