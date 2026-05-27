import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export const GetSessionStatsSchema = z.object({
  projectId: z.guid(),
  sessionId: z.string().min(1),
});

export interface SessionExtraStats {
  cacheReadInputTokens: number;
  reasoningTokens: number;
}

export async function getSessionExtraStats(input: z.infer<typeof GetSessionStatsSchema>): Promise<SessionExtraStats> {
  const { projectId, sessionId } = GetSessionStatsSchema.parse(input);

  const [row] = await executeQuery<SessionExtraStats>({
    query: `
      SELECT
        SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.cache_read_input_tokens')) as cacheReadInputTokens,
        SUM(simpleJSONExtractUInt(attributes, 'gen_ai.usage.reasoning_tokens')) as reasoningTokens
      FROM spans
      WHERE session_id = {sessionId: String}
        AND span_type = 'LLM'
    `,
    projectId,
    parameters: { sessionId },
  });

  return {
    cacheReadInputTokens: row?.cacheReadInputTokens ?? 0,
    reasoningTokens: row?.reasoningTokens ?? 0,
  };
}
