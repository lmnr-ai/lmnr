import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";

export const GetSharedBrowserSessionEventsSchema = z.object({
  traceId: z.string(),
});

export const getSharedBrowserSessionEvents = async (input: z.infer<typeof GetSharedBrowserSessionEventsSchema>) => {
  const { traceId } = GetSharedBrowserSessionEventsSchema.parse(input);

  const res = await clickhouseClient.query({
    query: `
      SELECT 
        timestamp,
        event_type as type,
        base64Encode(data) as data
      FROM browser_session_events
      WHERE trace_id = {traceId: UUID}
      ORDER BY timestamp ASC`,
    format: "JSONEachRow",
    query_params: {
      traceId: traceId,
    },
  });

  return res;
};
