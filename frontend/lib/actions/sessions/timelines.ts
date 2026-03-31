import { z } from "zod/v4";

import { TimeRangeSchema } from "@/lib/actions/common/types";
import { executeQuery } from "@/lib/actions/sql";
import { type TraceTimelineItem } from "@/lib/traces/types";

export const GetSessionTimelinesSchema = z.object({
  projectId: z.guid(),
  sessionIds: z.array(z.string()).min(1),
  ...TimeRangeSchema.shape,
});

type TraceTimelineRow = TraceTimelineItem & {
  sessionId: string;
};

export async function getSessionTimelines(
  input: z.infer<typeof GetSessionTimelinesSchema>
): Promise<Record<string, TraceTimelineItem[]>> {
  const { projectId, sessionIds, pastHours, startDate, endDate } = GetSessionTimelinesSchema.parse(input);

  const selectColumns = [
    "id",
    "session_id as sessionId",
    "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
    "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
    "status",
  ];

  const conditions: string[] = ["session_id IN ({sessionIds:Array(String)})"];

  const parameters: Record<string, string | string[]> = {
    sessionIds,
  };

  if (pastHours && !isNaN(parseFloat(pastHours))) {
    conditions.push("start_time >= now() - INTERVAL {pastHours:UInt32} HOUR");
    parameters.pastHours = String(parseInt(pastHours));
  } else {
    if (startDate) {
      conditions.push("start_time >= {startDate:String}");
      parameters.startDate = startDate;
    }
    if (endDate) {
      conditions.push("start_time <= {endDate:String}");
      parameters.endDate = endDate;
    }
  }

  const query = `SELECT ${selectColumns.join(", ")} FROM traces WHERE ${conditions.join(" AND ")} ORDER BY start_time ASC LIMIT 1000`;

  const rows = await executeQuery<TraceTimelineRow>({
    query,
    parameters,
    projectId,
  });

  const result: Record<string, TraceTimelineItem[]> = {};
  for (const row of rows) {
    const { sessionId, ...item } = row;
    if (!result[sessionId]) {
      result[sessionId] = [];
    }
    result[sessionId].push(item);
  }

  return result;
}
