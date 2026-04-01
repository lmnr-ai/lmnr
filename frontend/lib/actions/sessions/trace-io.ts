import { tryParseJson } from "@/lib/actions/common/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";

/**
 * Fetches the input and output of the "main agent" for a given trace.
 *
 * Strategy:
 * 1. Find all LLM spans in the trace
 * 2. Group by system prompt (first message content hash) to identify sub-agents
 * 3. The "main agent" is the one whose earliest span has the earliest start_time
 * 4. Input: first user message from the main agent's first LLM span
 * 5. Output: rendered preview from the main agent's last LLM span (via processSpanPreviews)
 */
export async function getMainAgentIO({
  traceId,
  projectId,
  startDate,
  endDate,
}: {
  traceId: string;
  projectId: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ input: string | null; output: string | null }> {
  const timeFilter = [
    startDate ? "start_time >= {startDate: DateTime64(9)}" : "",
    endDate ? "start_time <= {endDate: DateTime64(9)}" : "",
  ]
    .filter(Boolean)
    .map((f) => `AND ${f}`)
    .join("\n        ");

  const mainAgentFilter = `
    cityHash64(JSONExtractString(JSONExtractRaw(input, 1), 'content')) = (
      SELECT cityHash64(JSONExtractString(JSONExtractRaw(input, 1), 'content'))
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
        ${timeFilter}
      ORDER BY start_time ASC
      LIMIT 1
    )
  `;

  const inputQuery = `
    SELECT input
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      ${timeFilter}
      AND ${mainAgentFilter}
    ORDER BY start_time ASC
    LIMIT 1
  `;

  const outputQuery = `
    SELECT span_id as spanId, output as data, name
    FROM spans
    WHERE trace_id = {traceId: UUID}
      AND span_type = 'LLM'
      ${timeFilter}
      AND ${mainAgentFilter}
    ORDER BY start_time DESC
    LIMIT 1
  `;

  const parameters: Record<string, string> = { traceId };
  if (startDate) parameters.startDate = startDate.replace("Z", "");
  if (endDate) parameters.endDate = endDate.replace("Z", "");

  const [inputRows, outputRows] = await Promise.all([
    executeQuery<{ input: string }>({ query: inputQuery, parameters, projectId }),
    executeQuery<{ spanId: string; data: string; name: string }>({ query: outputQuery, parameters, projectId }),
  ]);

  const inputText = inputRows.length > 0 ? extractLastUserMessage(inputRows[0].input) : null;

  let outputText: string | null = null;
  if (outputRows.length > 0) {
    const { spanId } = outputRows[0];
    const previews = await processSpanPreviews(outputRows, projectId, [spanId], { [spanId]: "LLM" });
    outputText = previews[spanId] || null;
  }

  return { input: inputText, output: outputText };
}

/** Extract the last user message content from an LLM span input. */
function extractLastUserMessage(raw: string): string | null {
  const parsed = tryParseJson(raw);
  if (!Array.isArray(parsed)) return raw || null;

  for (let i = parsed.length - 1; i >= 0; i--) {
    if (parsed[i]?.role === "user") {
      const content = parsed[i].content;
      if (typeof content === "string") return content;
      // Handle array content (e.g. Anthropic format with text parts)
      if (Array.isArray(content)) {
        const textPart = content.find((p: any) => p?.type === "text" && typeof p.text === "string");
        if (textPart) return textPart.text;
      }
    }
  }

  return raw || null;
}
