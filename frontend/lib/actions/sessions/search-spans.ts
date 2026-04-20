import { compact } from "lodash";
import { z } from "zod/v4";

import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { type Filter } from "@/lib/actions/common/filters";
import { FiltersSchema } from "@/lib/actions/common/types";
import {
  aggregateSpanMetrics,
  buildSpansQueryWithParams,
  spansSelectColumns,
  transformSpanWithEvents,
} from "@/lib/actions/spans/utils";
import { executeQuery } from "@/lib/actions/sql";
import { type SpanSearchType } from "@/lib/clickhouse/types";

import { searchSpans, type SpanSearchHit } from "../traces/search";

export const GetSessionSpansSchema = FiltersSchema.extend({
  projectId: z.guid(),
  sessionId: z.string().min(1),
  search: z.string().nullable().optional(),
  searchIn: z.array(z.string()).default([]),
});

export interface SessionSpansTraceResult {
  traceId: string;
  spans: TraceViewSpan[];
}

export interface SessionSpansResult {
  traces: SessionSpansTraceResult[];
}

export async function getSessionSpans(input: z.infer<typeof GetSessionSpansSchema>): Promise<SessionSpansResult> {
  const { projectId, sessionId, search, searchIn, filter: inputFilters } = input;
  const filters: Filter[] = compact(inputFilters);

  // 1. Get trace IDs + time bounds for this session from the ClickHouse traces table.
  const traceRows = await executeQuery<{
    id: string;
    startTime: string;
    endTime: string;
  }>({
    query: `
      SELECT
        id,
        formatDateTime(start_time, '%Y-%m-%dT%H:%i:%S.%fZ') as startTime,
        formatDateTime(end_time, '%Y-%m-%dT%H:%i:%S.%fZ') as endTime
      FROM traces
      WHERE session_id = {sessionId: String}
        AND project_id = {projectId: UUID}
      ORDER BY start_time ASC
    `,
    parameters: { sessionId, projectId },
    projectId,
  });

  if (traceRows.length === 0) {
    return { traces: [] };
  }

  const traceIds = traceRows.map((t) => t.id);
  const startTime = new Date(Math.min(...traceRows.map((t) => new Date(t.startTime).getTime())) - 1000).toISOString();
  const endTime = new Date(Math.max(...traceRows.map((t) => new Date(t.endTime).getTime())) + 1000).toISOString();

  // 2. Full-text search (Quickwit). Scoped to this session's traces via
  //    traceIds — Quickwit builds a `trace_id IN [...]` filter, so only
  //    session-owned spans are searched (no post-filtering needed).
  let spanHits: SpanSearchHit[] = [];
  if (search) {
    spanHits = await searchSpans({
      projectId,
      traceIds,
      searchQuery: search,
      timeRange: { start: new Date(startTime), end: new Date(endTime) },
      searchType: searchIn as SpanSearchType[],
      getSnippets: true,
    });

    if (spanHits.length === 0) {
      return { traces: [] };
    }
  }

  const matchedSpanIds = spanHits.map((h) => h.span_id);

  // 3. ClickHouse query scoped to this session's traces.
  const { query, parameters } = buildSpansQueryWithParams({
    projectId,
    spanIds: matchedSpanIds.length > 0 ? matchedSpanIds : undefined,
    filters,
    startTime,
    endTime,
    columns: [...spansSelectColumns, "attributes", "events"],
    customConditions: [
      {
        condition: `trace_id IN ({sessionTraceIds: Array(UUID)})`,
        params: { sessionTraceIds: traceIds },
      },
    ],
    orderBy: [{ column: "start_time", direction: "ASC" }],
  });

  const rawSpans = await executeQuery<
    Omit<TraceViewSpan, "attributes" | "events"> & {
      attributes: string;
      events: { timestamp: number; name: string; attributes: string }[];
    }
  >({
    query,
    parameters,
    projectId,
  });

  if (rawSpans.length === 0) {
    return { traces: [] };
  }

  // 4. Transform + aggregate (no parent rewiring — search results are flat).
  const noRewiring = new Map<string, string | undefined>();
  const transformed = rawSpans.map((span) =>
    transformSpanWithEvents(
      span as Omit<TraceViewSpan, "attributes" | "events"> & {
        attributes: string;
        events: { timestamp: number; name: string; attributes: string }[];
      },
      noRewiring
    )
  );
  const processed = aggregateSpanMetrics(transformed);

  // 5. Attach search snippets.
  if (search && spanHits.length > 0) {
    const snippetMap = new Map<string, SpanSearchHit>();
    for (const hit of spanHits) {
      if (!snippetMap.has(hit.span_id)) {
        snippetMap.set(hit.span_id, hit);
      }
    }
    for (const span of processed) {
      const hit = snippetMap.get(span.spanId);
      if (hit) {
        span.inputSnippet = hit.input_snippet;
        span.outputSnippet = hit.output_snippet;
        span.attributesSnippet = hit.attributes_snippet;
      }
    }
  }

  // 6. Group by trace and compute agentPaths per trace.
  const byTrace = new Map<string, TraceViewSpan[]>();
  for (const span of processed) {
    const arr = byTrace.get(span.traceId) ?? [];
    arr.push(span);
    byTrace.set(span.traceId, arr);
  }

  const results: SessionSpansTraceResult[] = [];
  for (const [traceId, spans] of byTrace) {
    results.push({
      traceId,
      spans,
    });
  }

  return { traces: results };
}
