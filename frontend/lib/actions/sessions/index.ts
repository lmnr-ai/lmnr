import { compact } from "lodash";
import { z } from "zod/v4";

import { type Filter } from "@/lib/actions/common/filters";
import { PaginationFiltersSchema, TimeRangeSchema } from "@/lib/actions/common/types";
import { buildSessionsQueryWithParams } from "@/lib/actions/sessions/utils";
import { executeQuery } from "@/lib/actions/sql";
import { searchSpans, type SpanSearchHit } from "@/lib/actions/traces/search";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { type SpanSearchType } from "@/lib/clickhouse/types";
import { getTimeRange } from "@/lib/clickhouse/utils";
import { type SessionRow, type TraceRow } from "@/lib/traces/types";

export const GetSessionsSchema = PaginationFiltersSchema.extend({
  ...TimeRangeSchema.shape,
  projectId: z.guid(),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
  sortColumn: z
    .enum(["start_time", "end_time", "duration", "total_tokens", "total_cost", "trace_count"])
    .nullable()
    .optional(),
  sortDirection: z.enum(["ASC", "DESC"]).nullable().optional(),
});

export const DeleteSessionsSchema = z.object({
  projectId: z.guid(),
  sessionIds: z.array(z.string()).min(1),
});

export async function getSessions(input: z.infer<typeof GetSessionsSchema>): Promise<{ items: SessionRow[] }> {
  const {
    projectId,
    pastHours,
    startDate: startTime,
    endDate: endTime,
    pageNumber,
    pageSize,
    search,
    searchIn,
    filter: inputFilters,
    sortColumn,
    sortDirection,
  } = input;

  const filters: Filter[] = compact(inputFilters);

  const limit = pageSize;
  const offset = Math.max(0, pageNumber * pageSize);

  const spanHits: SpanSearchHit[] = search
    ? await searchSpans({
        projectId,
        searchQuery: search,
        timeRange: getTimeRange(pastHours, startTime, endTime),
        searchType: searchIn as SpanSearchType[],
      })
    : [];
  const traceIds = [...new Set(spanHits.map((hit) => hit.trace_id))];

  if (search && traceIds.length === 0) {
    return { items: [] };
  }

  const { query: mainQuery, parameters: mainParams } = buildSessionsQueryWithParams({
    traceIds,
    filters,
    limit,
    offset,
    startTime,
    endTime,
    pastHours,
    sortColumn: sortColumn ?? undefined,
    sortDirection: sortDirection ?? undefined,
  });

  const items = await executeQuery<Omit<SessionRow, "subRows">>({
    query: mainQuery,
    parameters: mainParams,
    projectId,
  });

  const sessionItems = items.map((item) => ({ ...item, subRows: [] }));

  return { items: sessionItems };
}

export const GetSessionTracesSchema = z.object({
  projectId: z.guid(),
  sessionId: z.string().min(1),
});

// Pad the derived start_time bounds so the validator's traces_v0 window covers rows a newer version could shift (LAM-1876).
const SESSION_TRACES_PAD_BEFORE_MS = 60 * 60 * 1000;
const SESSION_TRACES_PAD_AFTER_MS = 3 * 60 * 60 * 1000;
// No pagination in the session panel; cap the payload.
const SESSION_TRACES_LIMIT = 500;

// Only the columns the session view renders.
const sessionTracesSelectColumns = [
  "id",
  "formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime",
  "formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime",
  "input_tokens as inputTokens",
  "output_tokens as outputTokens",
  "total_tokens as totalTokens",
  "input_cost as inputCost",
  "output_cost as outputCost",
  "total_cost as totalCost",
  "cache_read_input_tokens as cacheReadInputTokens",
  "metadata",
  "agent_input as agentInput",
];

// Two queries: a `session_id`-only filter has no time bound (whole-project scan), so first resolve the
// session's start_time range cheaply, then fetch the UI columns bounded by it so the validator prunes traces_v0.
export async function getSessionTraces(input: z.infer<typeof GetSessionTracesSchema>): Promise<{ items: TraceRow[] }> {
  const { projectId, sessionId } = GetSessionTracesSchema.parse(input);

  const bounds = await executeQuery<{ minStart: string; maxStart: string }>({
    query: `
      SELECT
        formatDateTime(min(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') as minStart,
        formatDateTime(max(start_time), '%Y-%m-%dT%H:%i:%S.%fZ') as maxStart
      FROM traces
      WHERE session_id = {sessionId: String}
        AND trace_type = 'DEFAULT'
    `,
    parameters: { sessionId },
    projectId,
  });

  const { minStart, maxStart } = bounds[0] ?? { minStart: "", maxStart: "" };
  // Empty session: min/max over no rows yields the epoch-zero sentinel.
  if (!minStart || !maxStart || minStart.startsWith("1970-01-01")) {
    return { items: [] };
  }

  const startTime = new Date(new Date(minStart).getTime() - SESSION_TRACES_PAD_BEFORE_MS).toISOString();
  const endTime = new Date(new Date(maxStart).getTime() + SESSION_TRACES_PAD_AFTER_MS).toISOString();

  const items = await executeQuery<TraceRow>({
    query: `
      SELECT ${sessionTracesSelectColumns.join(", ")}
      FROM traces
      WHERE session_id = {sessionId: String}
        AND trace_type = 'DEFAULT'
        AND start_time >= {startTime: String}
        AND start_time <= {endTime: String}
      ORDER BY start_time ASC
      LIMIT {limit: UInt32}
    `,
    parameters: {
      sessionId,
      startTime: startTime.replace("Z", ""),
      endTime: endTime.replace("Z", ""),
      limit: SESSION_TRACES_LIMIT,
    },
    projectId,
  });

  return { items };
}

export const GetSessionTraceNeighborsSchema = GetSessionTracesSchema.extend({
  traceId: z.guid(),
  startTime: z.iso.datetime({ offset: true, local: true }),
});

export type SessionTraceNeighbor = {
  id: string;
  startTime: string;
  endTime: string;
  topSpanName: string | null;
  agentInputPreview: string;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
  cacheReadInputTokens: number;
};

// Neighbors are searched only this far from the current trace: an unbounded session_id lookup scans the whole
// project, too costly to pay on every trace open. A gap wider than this hides the card.
const SESSION_NEIGHBOR_WINDOW_MS = 24 * 60 * 60 * 1000;

const sessionNeighborSelect = `
  SELECT
    id,
    formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
    formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime,
    top_span_name as topSpanName,
    leftUTF8(agent_input, 300) as agentInputPreview,
    input_tokens as inputTokens,
    output_tokens as outputTokens,
    total_cost as totalCost,
    cache_read_input_tokens as cacheReadInputTokens
  FROM traces
  WHERE session_id = {sessionId: String}
    AND trace_type = 'DEFAULT'
    AND id != {traceId: UUID}
`;

export async function getSessionTraceNeighbors(
  input: z.infer<typeof GetSessionTraceNeighborsSchema>
): Promise<{ prev: SessionTraceNeighbor | null; next: SessionTraceNeighbor | null }> {
  const { projectId, sessionId, traceId, startTime } = GetSessionTraceNeighborsSchema.parse(input);

  const anchorMs = new Date(startTime).getTime();
  const toParam = (ms: number) => new Date(ms).toISOString().replace("Z", "");
  const parameters = {
    sessionId,
    traceId,
    anchor: toParam(anchorMs),
    windowStart: toParam(anchorMs - SESSION_NEIGHBOR_WINDOW_MS),
    windowEnd: toParam(anchorMs + SESSION_NEIGHBOR_WINDOW_MS),
  };

  const [prev, next] = await Promise.all([
    executeQuery<SessionTraceNeighbor>({
      query: `${sessionNeighborSelect}
        AND start_time >= {windowStart: String}
        AND start_time <= {anchor: String}
      ORDER BY start_time DESC
      LIMIT 1`,
      parameters,
      projectId,
    }),
    executeQuery<SessionTraceNeighbor>({
      query: `${sessionNeighborSelect}
        AND start_time > {anchor: String}
        AND start_time <= {windowEnd: String}
      ORDER BY start_time ASC
      LIMIT 1`,
      parameters,
      projectId,
    }),
  ]);

  return { prev: prev[0] ?? null, next: next[0] ?? null };
}

const SESSION_TRACE_IDS_LIMIT = 1000;

// Ordered ids behind the trace header's "n / total" badge. A session can span any time range, so this is
// unbounded and scans the project like the session page does; the client fetches it once per session.
export async function getSessionTraceIds(
  input: z.infer<typeof GetSessionTracesSchema>
): Promise<{ ids: string[]; truncated: boolean }> {
  const { projectId, sessionId } = GetSessionTracesSchema.parse(input);

  const rows = await executeQuery<{ id: string }>({
    query: `
      SELECT id
      FROM traces
      WHERE session_id = {sessionId: String}
        AND trace_type = 'DEFAULT'
      ORDER BY start_time ASC
      LIMIT {limit: UInt32}
    `,
    parameters: { sessionId, limit: SESSION_TRACE_IDS_LIMIT + 1 },
    projectId,
  });

  return {
    ids: rows.slice(0, SESSION_TRACE_IDS_LIMIT).map((r) => r.id),
    truncated: rows.length > SESSION_TRACE_IDS_LIMIT,
  };
}

export async function deleteSessions(input: z.infer<typeof DeleteSessionsSchema>) {
  const { projectId, sessionIds } = DeleteSessionsSchema.parse(input);

  await clickhouseClient.command({
    query: `
        DELETE FROM spans
        WHERE project_id = {projectId: UUID} 
            AND session_id in ({sessionIds: Array(String)})
      `,
    query_params: {
      sessionIds,
      projectId,
    },
  });
}
