import { createHash } from "crypto";

import { tryParseJson } from "@/lib/actions/common/utils";
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
  SELECT output AS output_content
  FROM spans
  WHERE trace_id = {traceId: UUID}
    AND span_type = 'LLM'
    AND path = {path: String}
  ORDER BY start_time DESC
  LIMIT 1
`;

export async function getMainAgentIO({
  traceId,
  projectId,
}: {
  traceId: string;
  projectId: string;
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

  const [inputRows, outputRows] = await Promise.all([
    executeQuery<{ input: string }>({
      query: INPUT_QUERY,
      parameters: { traceId, path: topPath },
      projectId,
    }),
    executeQuery<{ output_content: string }>({
      query: OUTPUT_QUERY,
      parameters: { traceId, path: topPath },
      projectId,
    }),
  ]);

  const rawOutput = outputRows.length > 0 ? outputRows[0].output_content || null : null;

  if (inputRows.length === 0) {
    return { input: null, output: rawOutput };
  }

  return { input: await extractInput(inputRows[0].input), output: rawOutput };
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
