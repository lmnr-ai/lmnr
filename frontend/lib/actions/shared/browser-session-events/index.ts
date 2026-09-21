import { eq } from "drizzle-orm";
import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { sharedTraces } from "@/lib/db/migrations/schema";

export const GetSharedBrowserSessionEventsSchema = z.object({
  traceId: z.guid(),
});

export const getSharedBrowserSessionEvents = async (input: z.infer<typeof GetSharedBrowserSessionEventsSchema>) => {
  const { traceId } = GetSharedBrowserSessionEventsSchema.parse(input);

  const sharedTrace = await db.query.sharedTraces.findFirst({
    where: eq(sharedTraces.id, traceId),
  });

  if (!sharedTrace) {
    throw new Error("No shared trace found.");
  }

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
