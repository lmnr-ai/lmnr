import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { buildTimeRangeWithFill } from "@/lib/actions/common/query-builder";
import { executeQuery } from "@/lib/actions/sql";
import { GetTracesSchema } from "@/lib/actions/traces";
import { searchSpans } from "@/lib/actions/traces/search";
import {
  buildTracesStatsWhereConditions,
  generateEmptyTimeBuckets,
  parseCustomColumnsJson,
} from "@/lib/actions/traces/utils";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";

/**
 * Aggregation metric for the traces stats chart Y-axis. `count` keeps the
 * stacked success/error bars; the rest emit a single `value` field built from
 * a SUM/AVG of a numeric column on `traces`.
 */
export const TRACE_STATS_METRICS = [
  "count",
  "total_tokens",
  "input_tokens",
  "output_tokens",
  "total_cost",
  "input_cost",
  "output_cost",
  "duration",
] as const;
export type TraceStatsMetric = (typeof TRACE_STATS_METRICS)[number];

export const GetTraceStatsSchema = GetTracesSchema.omit({
  pageNumber: true,
  pageSize: true,
}).extend({
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
  metric: z.enum(TRACE_STATS_METRICS).default("count"),
});

export type TracesStatsDataPoint = {
  timestamp: string;
  successCount: number;
  errorCount: number;
  value?: number;
} & Record<string, number>;

/** SQL aggregation per metric. `count` emits two stacked fields; the rest
 *  emit a single `value` field. */
const METRIC_SELECT: Record<TraceStatsMetric, string> = {
  count: `countIf(status != 'error') as successCount, countIf(status = 'error') as errorCount`,
  total_tokens: `SUM(total_tokens) as value`,
  input_tokens: `SUM(input_tokens) as value`,
  output_tokens: `SUM(output_tokens) as value`,
  total_cost: `SUM(total_cost) as value`,
  input_cost: `SUM(input_cost) as value`,
  output_cost: `SUM(output_cost) as value`,
  duration: `AVG(duration) as value`,
};

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
    metric,
    customColumns: customColumnsJson,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  const customColumns = parseCustomColumnsJson(customColumnsJson);

  const spanHits: { trace_id: string; span_id: string }[] = search
    ? await searchSpans({
        projectId,
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
      ${METRIC_SELECT[metric]}
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
