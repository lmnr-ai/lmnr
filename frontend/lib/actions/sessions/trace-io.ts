import { tryParseJson } from "@/lib/actions/common/utils";
import { executeQuery } from "@/lib/actions/sql";

/**
 * Fetches the input and output of the "main agent" for a given trace.
 *
 * Strategy:
 * 1. Find all LLM spans in the trace
 * 2. Group by system prompt (first message content hash) to identify sub-agents
 * 3. The "main agent" is the one whose earliest span has the earliest start_time
 * 4. Input: first user message from the main agent's first LLM span
 * 5. Output: last assistant message from the main agent's last LLM span
 */
export async function getMainAgentIO({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
}): Promise<{ input: string | null; output: string | null }> {
  const mainAgentFilter = `
    cityHash64(JSONExtractString(JSONExtractRaw(input, 1), 'content')) = (
      SELECT cityHash64(JSONExtractString(JSONExtractRaw(input, 1), 'content'))
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
      ORDER BY start_time ASC
      LIMIT 1
    )
  `;

  const inputQuery = `
    SELECT input
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      AND ${mainAgentFilter}
    ORDER BY start_time ASC
    LIMIT 1
  `;

  const outputQuery = `
    SELECT output
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      AND ${mainAgentFilter}
    ORDER BY start_time DESC
    LIMIT 1
  `;

  const [inputRows, outputRows] = await Promise.all([
    executeQuery<{ input: string }>({ query: inputQuery, parameters: { traceId }, projectId }),
    executeQuery<{ output: string }>({ query: outputQuery, parameters: { traceId }, projectId }),
  ]);

  const inputText = inputRows.length > 0 ? extractFirstUserMessage(inputRows[0].input) : null;
  const outputText = outputRows.length > 0 ? extractLastAssistantMessage(outputRows[0].output) : null;

  return { input: inputText, output: outputText };
}

/** Extract the first user message content from an LLM span input. */
function extractFirstUserMessage(raw: string): string | null {
  const parsed = tryParseJson(raw);
  if (!Array.isArray(parsed)) return raw || null;

  for (const msg of parsed) {
    if (msg?.role === "user") {
      if (typeof msg.content === "string") return msg.content;
      // Handle array content (e.g. Anthropic format with text parts)
      if (Array.isArray(msg.content)) {
        const textPart = msg.content.find((p: any) => p?.type === "text" && typeof p.text === "string");
        if (textPart) return textPart.text;
      }
    }
  }

  return raw || null;
}

/** Extract the last assistant message content from an LLM span output. */
function extractLastAssistantMessage(raw: string): string | null {
  const parsed = tryParseJson(raw);
  if (!Array.isArray(parsed)) {
    return typeof parsed === "string" ? parsed : raw || null;
  }

  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]?.role === "assistant") {
      const content = parsed[i].content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textPart = content.find((p: any) => p?.type === "text" && typeof p.text === "string");
        if (textPart) return textPart.text;
      }
    }
  }

  return typeof parsed === "string" ? parsed : raw || null;
}
