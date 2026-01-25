import { compact } from "lodash";
import { z } from "zod/v4";

import { buildTimeRangeWithFill, buildWhereClause, type QueryParams } from "@/lib/actions/common/query-builder";
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

  const { fillFrom, fillTo } = buildTimeRangeWithFill({
    startTime,
    endTime,
    pastHours,
    timeColumn: "timestamp",
    intervalValue,
    intervalUnit,
  });

  const withFillClause =
    fillFrom && fillTo
      ? `WITH FILL
    FROM ${fillFrom}
    TO ${fillTo}
    STEP toInterval({intervalValue:UInt32}, {intervalUnit:String})`
      : "";

  const query = `
    SELECT 
      toStartOfInterval(timestamp, toInterval({intervalValue:UInt32}, {intervalUnit:String})) as timestamp,
      count() as count
    FROM signal_events
    ${whereResult.query}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    ${withFillClause}
  `;

  const items = await executeQuery<EventsStatsDataPoint>({
    query,
    parameters: {
      ...whereResult.parameters,
      intervalValue,
      intervalUnit,
    },
    projectId,
  });

  return { items };
}
