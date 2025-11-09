import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetEventStatsSchema = z.object({
  projectId: z.string(),
  eventName: z.string(),
  pastHours: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
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
  } = input;

  let timeConditions = "";
  const timeParams: Record<string, any> = {};
  let withFillFrom = "";
  let withFillTo = "";

  if (pastHours) {
    const hours = parseInt(pastHours);
    timeConditions = `AND timestamp >= now() - INTERVAL ${hours} HOUR AND timestamp <= now()`;
    withFillFrom = `now() - INTERVAL ${hours} HOUR`;
    withFillTo = `now()`;
  } else if (startTime) {
    timeConditions = `AND timestamp >= {startTime:String}`;
    timeParams.startTime = startTime.replace("Z", "");
    withFillFrom = `toDateTime64({startTime:String}, 9)`;

    if (endTime) {
      timeConditions += ` AND timestamp <= {endTime:String}`;
      timeParams.endTime = endTime.replace("Z", "");
      withFillTo = `toDateTime64({endTime:String}, 9)`;
    } else {
      timeConditions += ` AND timestamp <= now()`;
      withFillTo = `now()`;
    }
  } else {
    timeConditions = `AND timestamp >= now() - INTERVAL 24 HOUR AND timestamp <= now()`;
    withFillFrom = `now() - INTERVAL 24 HOUR`;
    withFillTo = `now()`;
  }

  const intervalFn = `INTERVAL ${intervalValue} ${intervalUnit.toUpperCase()}`;

  const query = `
    SELECT 
      toStartOfInterval(timestamp, ${intervalFn}) as timestamp,
      count() as count
    FROM events
    WHERE name = {eventName:String}
      ${timeConditions}
    GROUP BY timestamp
    ORDER BY timestamp ASC
    WITH FILL
    FROM toStartOfInterval(${withFillFrom}, ${intervalFn})
    TO toStartOfInterval(${withFillTo}, ${intervalFn})
    STEP ${intervalFn}
  `;

  const parameters = {
    eventName,
    ...timeParams,
  };

  console.log("query", query, parameters);
  const items = await executeQuery<EventsStatsDataPoint>({
    query,
    parameters,
    projectId,
  });

  return { items };
}
