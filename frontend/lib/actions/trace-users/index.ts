import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetTraceUserStatsSchema = z.object({
  projectId: z.guid(),
  userId: z.string().min(1),
});

export interface TraceUserStats {
  traceCount: number;
  sessionCount: number;
  firstSeen: string;
  lastSeen: string;
}

/** Lifetime activity of one end user (the `user_id` association property) in a project. */
export async function getTraceUserStats(
  input: z.infer<typeof GetTraceUserStatsSchema>
): Promise<TraceUserStats | null> {
  const { projectId, userId } = GetTraceUserStatsSchema.parse(input);

  const [row] = await executeQuery<TraceUserStats>({
    query: `
      SELECT
        count() AS traceCount,
        uniqIf(session_id, session_id != '' AND session_id != '<null>') AS sessionCount,
        formatDateTime(min(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') AS firstSeen,
        formatDateTime(max(end_time), '%Y-%m-%dT%H:%i:%S.%fZ') AS lastSeen
      FROM traces
      WHERE user_id = {userId: String} AND trace_type = 'DEFAULT'
    `,
    parameters: { userId },
    projectId,
  });

  return row && Number(row.traceCount) > 0 ? row : null;
}
