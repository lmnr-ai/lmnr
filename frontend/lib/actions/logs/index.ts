import { z } from "zod/v4";

import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";
import { type Log } from "@/lib/logs/types";

const GetSpanLogsSchema = z.object({
  spanId: z.string(),
  projectId: z.string(),
  traceId: z.string().optional(),
});

export async function getSpanLogs(input: z.infer<typeof GetSpanLogsSchema>): Promise<Log[]> {
  const { spanId, traceId, projectId } = GetSpanLogsSchema.parse(input);

  const whereConditions = [`span_id = {spanId: UUID}`];
  const parameters: Record<string, any> = { spanId };

  if (traceId) {
    whereConditions.push(`trace_id = {traceId: UUID}`);
    parameters.traceId = traceId;
  }

  const logs = await executeQuery<{
    logId: string;
    traceId: string;
    spanId: string;
    time: string;
    observedTime: string;
    severityNumber: number;
    severityText: string;
    body: string;
    attributes: string;
    eventName: string;
  }>({
    query: `
      SELECT 
        log_id as logId,
        trace_id as traceId,
        span_id as spanId,
        formatDateTime(time, '%Y-%m-%dT%H:%i:%S.%fZ') as time,
        formatDateTime(observed_time, '%Y-%m-%dT%H:%i:%S.%fZ') as observedTime,
        severity_number as severityNumber,
        severity_text as severityText,
        body,
        attributes,
        event_name as eventName
      FROM logs
      WHERE ${whereConditions.join(" AND ")}
      ORDER BY time ASC
    `,
    parameters,
    projectId,
  });

  return logs.map((log) => ({
    ...log,
    projectId,
    attributes: tryParseJson(log.attributes),
  }));
}
