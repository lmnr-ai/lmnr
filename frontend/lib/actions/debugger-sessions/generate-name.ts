import { generateObject } from "ai";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { executeQuery } from "@/lib/actions/sql";
import { getLanguageModel } from "@/lib/ai/model";
import { db } from "@/lib/db/drizzle";
import { rolloutSessions } from "@/lib/db/migrations/schema";

const MAX_CONTENT_CHARS = 1000;

const NameResultSchema = z.object({
  success: z.boolean().describe("Whether a descriptive name could be generated from the trace content"),
  name: z
    .string()
    .optional()
    .describe("A short 2-5 word descriptive name for the debug session (when success is true)"),
  error: z
    .string()
    .optional()
    .describe("Brief explanation of why a name could not be generated (when success is false)"),
});

export type GenerateNameResult = { success: true; name: string } | { success: false; error: string };

/**
 * Auto-name a debug session from the input of its first trace. Persists the
 * generated name onto the session and returns it. The session is grouped by
 * `rollout.session_id` trace metadata (set by the SDK).
 */
export async function generateSessionName(projectId: string, sessionId: string): Promise<GenerateNameResult> {
  const [trace] = await executeQuery<{ rootSpanInput: string | null }>({
    query: `
      SELECT root_span_input as rootSpanInput
      FROM traces
      WHERE simpleJSONExtractString(metadata, 'rollout.session_id') = {sessionId: String}
      ORDER BY start_time ASC
      LIMIT 1
    `,
    projectId,
    parameters: { sessionId },
  });

  const content = trace?.rootSpanInput?.slice(0, MAX_CONTENT_CHARS);

  if (!content) {
    return { success: false, error: "No trace content available to name the session" };
  }

  const { object } = await generateObject({
    model: getLanguageModel("small"),
    schema: NameResultSchema,
    prompt: `Given the input of the first run in a debug session, generate a short 2-5 word descriptive name for the session. If the input is too vague to name, set success to false with a brief error.\n\nRun input:\n${content}`,
  });

  if (!object.success || !object.name) {
    return { success: false, error: object.error || "Failed to generate name" };
  }

  await db
    .update(rolloutSessions)
    .set({ name: object.name })
    .where(and(eq(rolloutSessions.id, sessionId), eq(rolloutSessions.projectId, projectId)));

  return { success: true, name: object.name };
}
