import { createHash } from "crypto";

import { tryParseJson } from "@/lib/actions/common/utils";
import { processSpanPreviews } from "@/lib/actions/spans/previews";
import { executeQuery } from "@/lib/actions/sql";
import { cache } from "@/lib/cache";

import { applyRe2Regex, generateExtractionRegex } from "./prompts";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const REGEX_CACHE_PREFIX = "trace_io_regex:";

const TOP_PATH_QUERY = `
  SELECT path
  FROM (
      SELECT path, total_tokens
      FROM spans
      WHERE trace_id = {traceId: UUID}
        AND span_type = 'LLM'
      ORDER BY start_time ASC
      LIMIT 20
  )
  GROUP BY path
  ORDER BY sum(total_tokens) DESC
  LIMIT 1
`;

const INPUT_QUERY = `
  SELECT input
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type = 'LLM'
    AND path = {path: String}
  ORDER BY start_time ASC
  LIMIT 1
`;

const OUTPUT_QUERY = `
  SELECT span_id AS spanId, output AS data, name
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type = 'LLM'
    AND path = {path: String}
  ORDER BY start_time DESC
  LIMIT 1
`;

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
  const pathRows = await executeQuery<{ path: string }>({
    query: TOP_PATH_QUERY,
    parameters: { traceId },
    projectId,
  });

  if (pathRows.length === 0) {
    return { input: null, output: null };
  }

  const topPath = pathRows[0].path;

  const parameters: Record<string, string> = { traceId };
  if (startDate) parameters.startDate = startDate.replace("Z", "");
  if (endDate) parameters.endDate = endDate.replace("Z", "");

  const [inputRows, outputRows] = await Promise.all([
    executeQuery<{ input: string }>({
      query: INPUT_QUERY,
      parameters: { traceId, path: topPath },
      projectId,
    }),
    executeQuery<{ spanId: string; data: string; name: string }>({
      query: OUTPUT_QUERY,
      parameters: { traceId, path: topPath },
      projectId,
    }),
  ]);

  let outputText: string | null = null;
  if (outputRows.length > 0) {
    const { spanId } = outputRows[0];
    const previews = await processSpanPreviews(outputRows, projectId, [spanId], { [spanId]: "LLM" });
    outputText = previews[spanId] || null;
  }

  if (inputRows.length === 0) {
    return { input: null, output: outputText };
  }

  return { input: await extractInput(inputRows[0].input), output: outputText };
}

export async function getMainAgentIOBatch({
  traceIds,
  projectId,
}: {
  traceIds: string[];
  projectId: string;
}): Promise<Record<string, { input: string | null; output: string | null }>> {
  const results = await Promise.allSettled(traceIds.map((id) => getMainAgentIO({ traceId: id, projectId })));
  return Object.fromEntries(
    traceIds.map((id, i) => {
      const result = results[i];
      return [id, result.status === "fulfilled" ? result.value : { input: null, output: null }];
    })
  );
}

async function extractInput(rawInput: string): Promise<string | null> {
  const parsed = tryParseJson(rawInput);
  if (!Array.isArray(parsed)) return rawInput || null;

  const systemMessage = extractSystemMessage(parsed);
  const userMessage = extractLastUserMessage(parsed);

  if (!userMessage) return null;
  if (!systemMessage) return userMessage;

  const hash = createHash("sha256").update(systemMessage).digest("hex");
  const cacheKey = `${REGEX_CACHE_PREFIX}${hash}`;

  try {
    const cachedRegex = await cache.get<string>(cacheKey);
    if (cachedRegex) {
      const result = applyRe2Regex(cachedRegex, userMessage);
      if (result) {
        await cache.expire(cacheKey, SEVEN_DAYS_SECONDS).catch(() => {});
        return result;
      }
      await cache.remove(cacheKey).catch(() => {});
    }
  } catch {
    // Redis unavailable, fall through to generation
  }

  const regex = await generateExtractionRegex(userMessage);
  if (!regex) return userMessage;

  const result = applyRe2Regex(regex, userMessage);
  if (!result) return userMessage;

  await cache.set(cacheKey, regex, { expireAfterSeconds: SEVEN_DAYS_SECONDS }).catch(() => {});
  return result;
}

function extractSystemMessage(messages: any[]): string | null {
  const systemMsg = messages.find((m) => m?.role === "system");
  if (!systemMsg) return null;

  const content = systemMsg.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const textPart = content.find((p: any) => p?.type === "text" && typeof p.text === "string");
    if (textPart) return textPart.text;
  }
  return null;
}

function extractLastUserMessage(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user") {
      const content = messages[i].content;
      if (typeof content === "string") return content;
      if (Array.isArray(content)) {
        const textParts = content
          .filter((p: any) => p?.type === "text" && typeof p.text === "string")
          .map((p: any) => p.text as string);
        if (textParts.length > 0) return textParts.join("\n");
      }
    }
  }
  return null;
}
