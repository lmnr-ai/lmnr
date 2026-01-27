import { groupBy } from "lodash";
import YAML from "yaml";

import { executeQuery } from "@/lib/actions/sql";
import { tryParseJson } from "@/lib/utils";

const TRUNCATE_THRESHOLD = 64;
const PREVIEW_LENGTH = 24;

/**
 * Truncates a value if its string representation exceeds TRUNCATE_THRESHOLD.
 * Shows preview of start and end for long values.
 */
function truncateValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  const valueStr = typeof value === "string" ? value : JSON.stringify(value);

  if (valueStr.length <= TRUNCATE_THRESHOLD) {
    return value;
  }

  const start = valueStr.slice(0, PREVIEW_LENGTH);
  const end = valueStr.slice(-PREVIEW_LENGTH);
  const omitted = valueStr.length - PREVIEW_LENGTH * 2;
  return `${start}...(${omitted} chars omitted)...${end}`;
}

// Lightweight span info for skeleton view (no input/output)
interface SpanInfo {
  spanId: string;
  name: string;
  type: string;
  path: string;
  start: string;
  end: string;
  status: string;
  parent: string;
}

// Full span with input/output details
export interface Span extends SpanInfo {
  input: unknown;
  output: unknown;
  exception?: unknown;
}

const fetchSpanInfos = async (
  projectId: string,
  traceId: string
): Promise<SpanInfo[]> => {
  const spans = await executeQuery({
    projectId,
    query: `
      SELECT
        span_id as spanId,
        name,
        span_type as type,
        path,
        start_time as start,
        end_time as end,
        status,
        parent_span_id as parent
      FROM spans
      WHERE trace_id = {trace_id: UUID}
      ORDER BY start_time ASC
    `,
    parameters: {
      trace_id: traceId,
    },
  });

  return spans as SpanInfo[];
};

/**
 * Fetches full span details for specific span IDs.
 */
const fetchSpans = async (
  projectId: string,
  traceId: string,
  spanIds: string[]
): Promise<Map<string, Span>> => {
  if (spanIds.length === 0) {
    return new Map();
  }

  const spans = await executeQuery({
    projectId,
    query: `
      SELECT
        span_id as spanId,
        name,
        span_type as type,
        path,
        start_time as start,
        end_time as end,
        status,
        parent_span_id as parent,
        input,
        output
      FROM spans
      WHERE trace_id = {trace_id: UUID}
        AND span_id IN {span_ids: Array(UUID)}
    `,
    parameters: {
      trace_id: traceId,
      span_ids: spanIds,
    },
  });

  const events = await executeQuery({
    projectId,
    query: `
      SELECT span_id, attributes
      FROM events
      WHERE span_id IN {span_ids: Array(UUID)}
        AND name = 'exception'
    `,
    parameters: {
      span_ids: spanIds,
    },
  });

  const exceptionsMap = groupBy(events, "span_id");
  const spansMap = new Map<string, Span>();

  for (const span of spans as Array<SpanInfo & { input: string; output: string }>) {
    const fullSpan: Span = {
      ...span,
      input: tryParseJson(span.input),
      output: tryParseJson(span.output),
    };

    const exceptionEvents = exceptionsMap[span.spanId];
    if (exceptionEvents?.length > 0) {
      fullSpan.exception = tryParseJson((exceptionEvents[0] as { attributes: string }).attributes);
    }

    spansMap.set(span.spanId, fullSpan);
  }

  return spansMap;
};

/**
 * Fetches full span data for specific sequential IDs (1-indexed).
 */
export const getSpansByIds = async (
  projectId: string,
  traceId: string,
  ids: number[]
): Promise<Span[]> => {
  const spanInfos = await fetchSpanInfos(projectId, traceId);

  const requestedSpanIds = ids
    .filter((id) => id >= 1 && id <= spanInfos.length)
    .map((id) => spanInfos[id - 1].spanId);

  if (requestedSpanIds.length === 0) {
    return [];
  }

  const spansMap = await fetchSpans(projectId, traceId, requestedSpanIds);

  return ids
    .filter((id) => id >= 1 && id <= spanInfos.length)
    .map((id) => spansMap.get(spanInfos[id - 1].spanId)!)
    .filter(Boolean);
};

function calculateDuration(start: string, end: string): number {
  return (new Date(end).getTime() - new Date(start).getTime()) / 1000;
}

function spanInfosToSkeletonString(
  spanInfos: SpanInfo[],
  spanIdToSeqId: Record<string, number>
): string {
  let result = "legend: span_name (id, parent_id, type)\n";
  for (let i = 0; i < spanInfos.length; i++) {
    const info = spanInfos[i];
    const seqId = i + 1;
    const parentSeqId = info.parent ? spanIdToSeqId[info.parent] ?? null : null;
    result += `- ${info.name} (${seqId}, ${parentSeqId ?? "null"}, ${info.type})\n`;
  }
  return result;
}

interface DetailedSpanView {
  id: number;
  name: string;
  path: string;
  type: string;
  duration: number;
  parent: number | null;
  status?: string;
  input?: unknown;
  output?: unknown;
  exception?: unknown;
}

export interface TraceStructureResult {
  traceString: string;
}

export const getTraceStructureAsString = async (
  projectId: string,
  traceId: string
): Promise<TraceStructureResult> => {
  const spanInfos = await fetchSpanInfos(projectId, traceId);

  const spanIdToSeqId: Record<string, number> = {};
  spanInfos.forEach((info, index) => {
    spanIdToSeqId[info.spanId] = index + 1;
  });

  // Only fetch full details for LLM and TOOL spans
  const detailedSpanIds = spanInfos
    .filter((s) => s.type === "LLM" || s.type === "TOOL")
    .map((s) => s.spanId);

  const spansMap = await fetchSpans(projectId, traceId, detailedSpanIds);

  const skeletonString = spanInfosToSkeletonString(spanInfos, spanIdToSeqId);

  // Build detailed views with path-based compression
  const seenPaths = new Set<string>();
  const detailedSpans: DetailedSpanView[] = [];

  for (let i = 0; i < spanInfos.length; i++) {
    const info = spanInfos[i];
    if (info.type !== "LLM" && info.type !== "TOOL") {
      continue;
    }

    const span = spansMap.get(info.spanId);
    if (!span) continue;

    const seqId = i + 1;
    const parentSeqId = info.parent ? spanIdToSeqId[info.parent] ?? null : null;

    const spanView: DetailedSpanView = {
      id: seqId,
      name: info.name,
      path: info.path,
      type: info.type.toLowerCase(),
      duration: calculateDuration(info.start, info.end),
      parent: parentSeqId,
    };

    if (info.status === "error") {
      spanView.status = "error";
    }

    const isTool = info.type === "TOOL";

    // Only include input for first occurrence at each path
    if (!seenPaths.has(info.path)) {
      seenPaths.add(info.path);
      // Truncate tool span input, keep full LLM input
      spanView.input = isTool ? truncateValue(span.input) : span.input;
    }
    // Truncate tool span output, keep full LLM output
    spanView.output = isTool ? truncateValue(span.output) : span.output;

    if (span.exception) {
      spanView.exception = span.exception;
    }

    detailedSpans.push(spanView);
  }

  const traceYaml = YAML.stringify(detailedSpans);

  const traceString = `Here is the skeleton view of the trace:
<trace_skeleton>
${skeletonString}
</trace_skeleton>

Here are the detailed views of LLM and Tool spans:
<spans>
${traceYaml}
</spans>
`;

  return { traceString };
};

/**
 * Resolves a sequential span ID (1-indexed) to the actual span UUID.
 */
export const resolveSpanId = async (
  projectId: string,
  traceId: string,
  sequentialId: number
): Promise<string | null> => {
  const spans = await executeQuery({
    projectId,
    query: `
      SELECT span_id
      FROM spans
      WHERE trace_id = {trace_id: UUID}
      ORDER BY start_time ASC
      LIMIT 1 OFFSET {offset: UInt32}
    `,
    parameters: {
      trace_id: traceId,
      offset: sequentialId - 1,
    },
  });

  if (spans.length === 0) {
    return null;
  }

  return (spans[0] as { span_id: string }).span_id;
};
