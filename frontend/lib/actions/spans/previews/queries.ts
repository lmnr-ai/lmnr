import { executeQuery } from "@/lib/actions/sql";

export const PREVIEW_SPAN_TYPES = new Set(["LLM", "CACHED", "TOOL", "EXECUTOR", "EVALUATOR"]);

export interface InputSpanRow {
  spanId: string;
  firstMessage: string;
  lastMessage: string;
  promptHash: string;
}

const buildTimeConditions = (startDate?: string, endDate?: string): string[] =>
  [startDate ? "start_time >= {startDate: String}" : null, endDate ? "start_time <= {endDate: String}" : null].filter(
    (c): c is string => c !== null
  );

export async function fetchSpanData(
  projectId: string,
  traceId: string,
  spanIds: string[],
  spanTypes: Record<string, string>,
  startDate?: string,
  endDate?: string,
  inputSpanIds?: string[]
): Promise<{
  regularSpans: Array<{ spanId: string; data: string; name: string }>;
  inputSpanRows: InputSpanRow[];
}> {
  const inputSpanIdSet = new Set(inputSpanIds ?? []);
  const previewSpanIds = spanIds.filter((id) => PREVIEW_SPAN_TYPES.has(spanTypes[id] ?? ""));
  const inputSpanIdList = previewSpanIds.filter((id) => inputSpanIdSet.has(id));

  const timeConditions = buildTimeConditions(startDate, endDate);
  const timeClause = timeConditions.map((c) => `AND ${c}`).join("\n        ");
  const baseParams = { traceId, startDate, endDate };

  const [regularSpans, inputSpanRows] = await Promise.all([
    previewSpanIds.length > 0
      ? executeQuery<{ spanId: string; data: string; name: string }>({
          projectId,
          query: `
            SELECT
              span_id as spanId,
              if(span_type = 'TOOL', input, output) as data,
              name
            FROM spans
            WHERE trace_id = {traceId: UUID}
              AND span_id IN {spanIds: Array(UUID)}
              AND span_type IN ('LLM', 'CACHED', 'TOOL', 'EXECUTOR', 'EVALUATOR')
              ${timeClause}
          `,
          parameters: { ...baseParams, spanIds: previewSpanIds },
        })
      : ([] as Array<{ spanId: string; data: string; name: string }>),

    inputSpanIdList.length > 0
      ? executeQuery<InputSpanRow>({
          projectId,
          query: `
            SELECT
              span_id as spanId,
              arr[1] as firstMessage,
              if(length(arr) > 1, arr[length(arr)], '') as lastMessage,
              simpleJSONExtractString(attributes, 'lmnr.span.prompt_hash') as promptHash
            FROM (
              SELECT span_id, JSONExtractArrayRaw(input) as arr, attributes
              FROM spans
              WHERE trace_id = {traceId: UUID}
                AND span_id IN {spanIds: Array(UUID)}
                AND span_type IN ('LLM', 'CACHED')
                ${timeClause}
            )
          `,
          parameters: { ...baseParams, spanIds: inputSpanIdList },
        })
      : ([] as InputSpanRow[]),
  ]);

  return { regularSpans, inputSpanRows };
}
