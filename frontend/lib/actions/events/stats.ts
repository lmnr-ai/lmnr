import { compact } from "lodash";
import { z } from "zod/v4";

import { buildWhereClause, QueryParams } from "@/lib/actions/common/query-builder";
import { FiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { eventsColumnFilterConfig } from "@/lib/actions/events/utils";
import { executeQuery } from "@/lib/actions/sql";

export const GetEventStatsSchema = z.object({
  ...FiltersSchema.shape,
  ...TimeRangeSchema.shape,
  projectId: z.string(),
  eventName: z.string(),
  intervalValue: z.coerce.number().default(1),
  intervalUnit: z.enum(["minute", "hour", "day"]).default("hour"),
});

export interface EventsStatsDataPoint {
  timestamp: string;
  count: number;
}

export async function getEventStats(
  input: z.infer<typeof GetEventStatsSchema>
): Promise<{ items: EventsStatsDataPoint[] }> {
  const {
    projectId,
    eventName,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    intervalValue,
    intervalUnit,
    filter,
  } = input;

  const filters = compact(filter);

  // Build WHERE clause using the query builder for consistency with events table
  const customConditions: Array<{
    condition: string;
    params: QueryParams;
  }> = [
    {
      condition: "name = {eventName:String}",
      params: { eventName },
    },
  ];

  const whereResult = buildWhereClause({
    timeRange: {
      startTime,
      endTime,
      pastHours,
      timeColumn: "timestamp",
    },
    filters,
    columnFilterConfig: eventsColumnFilterConfig,
    customConditions,
  });

  let withFillFrom = "";
  let withFillTo = "";

  if (pastHours) {
    const hours = parseInt(pastHours);
    withFillFrom = `now() - INTERVAL ${hours} HOUR`;
    withFillTo = `now()`;
  } else if (startTime) {
    withFillFrom = `toDateTime64({startTime:String}, 9)`;
    withFillTo = endTime ? `toDateTime64({endTime:String}, 9)` : `now()`;
  } else {
    withFillFrom = `now() - INTERVAL 24 HOUR`;
    withFillTo = `now()`;
  }

  const intervalFn = `INTERVAL ${intervalValue} ${intervalUnit.toUpperCase()}`;

  const query = `
    SELECT 
      toStartOfInterval(timestamp, ${intervalFn}) as timestamp,
      count() as count
    FROM events
    ${whereResult.query}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    WITH FILL
    FROM toStartOfInterval(${withFillFrom}, ${intervalFn})
    TO toStartOfInterval(${withFillTo}, ${intervalFn})
    STEP ${intervalFn}
  `;

  const items = await executeQuery<EventsStatsDataPoint>({
    query,
    parameters: whereResult.parameters,
    projectId,
  });

  return { items };
}
