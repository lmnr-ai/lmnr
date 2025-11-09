import { compact } from "lodash";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { GetTracesSchema } from "@/lib/actions/traces";
import { buildTracesStatsWhereConditions, searchSpans } from "@/lib/actions/traces/utils";
import { SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { FilterDef } from "@/lib/db/modifiers";

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

  const filters: FilterDef[] = compact(inputFilters);

  const traceIds = search
    ? await searchSpans({
      projectId,
      searchQuery: search,
      timeRange: getTimeRange(pastHours, startTime, endTime),
      searchType: searchIn as SpanSearchType[],
    })
    : [];

  if (search && traceIds?.length === 0) {
    return { items: [] };
  }

  const { conditions: whereConditions, params: whereParams } = buildTracesStatsWhereConditions({
    traceType,
    traceIds,
    filters,
  });

  let timeConditions = "";
  const timeParams: Record<string, any> = {};
  let withFillFrom = "";
  let withFillTo = "";

  if (pastHours) {
    const hours = parseInt(pastHours);
    timeConditions = `AND start_time >= now() - INTERVAL ${hours} HOUR AND start_time <= now()`;
    withFillFrom = `now() - INTERVAL ${hours} HOUR`;
    withFillTo = `now()`;
  } else if (startTime) {
    timeConditions = `AND start_time >= {startTime:String}`;
    timeParams.startTime = startTime.replace("Z", "");
    withFillFrom = `toDateTime64({startTime:String}, 9)`;

    if (endTime) {
      timeConditions += ` AND start_time <= {endTime:String}`;
      timeParams.endTime = endTime.replace("Z", "");
      withFillTo = `toDateTime64({endTime:String}, 9)`;
    } else {
      timeConditions += ` AND start_time <= now()`;
      withFillTo = `now()`;
    }
  }

  const query = `
    SELECT 
      toStartOfInterval(start_time, toInterval({interval_value:UInt32}, {interval_unit:String})) as timestamp,
      countIf(status != 'error') as successCount,
      countIf(status = 'error') as errorCount,
    FROM traces
    WHERE ${whereConditions.join(" AND ")}
    ${timeConditions}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    WITH FILL
    FROM toStartOfInterval(${withFillFrom}, toInterval({interval_value:UInt32}, {interval_unit:String}))
    TO toStartOfInterval(${withFillTo}, toInterval({interval_value:UInt32}, {interval_unit:String}))
    STEP toInterval({interval_value:UInt32}, {interval_unit:String})
  `;

  const parameters = {
    ...whereParams,
    ...timeParams,
    interval_value: intervalValue,
    interval_unit: intervalUnit,
  };

  const items = await executeQuery<TracesStatsDataPoint>({
    query,
    parameters,
    projectId,
  });

  return { items };
}
