import {
  type ReaderListEntry,
  type ReaderListGroup,
  type TraceViewListSpan,
  type TraceViewSpan,
} from "@/components/traces/trace-view/store/base";
import { computePathInfoMap } from "@/components/traces/trace-view/store/utils";
import { type SessionSpansTraceResult } from "@/lib/actions/sessions/search-spans";
import { type AgentPaths } from "@/lib/actions/spans/utils";
import { type TraceRow } from "@/lib/traces/types";

/** Convert a full TraceViewSpan to the lightweight TraceViewListSpan shape
 *  used by ListItem/reader components. `pathInfo` is derived from the full
 *  span set via `computePathInfoMap` when available. */
export function spanToListSpan(span: TraceViewSpan, pathInfo?: TraceViewListSpan["pathInfo"]): TraceViewListSpan {
  return {
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    spanType: span.spanType,
    name: span.name,
    model: span.model,
    path: span.path,
    startTime: span.startTime,
    endTime: span.endTime,
    totalTokens: span.totalTokens,
    cacheReadInputTokens: span.cacheReadInputTokens,
    totalCost: span.totalCost,
    pending: span.pending,
    pathInfo: pathInfo ?? null,
    inputSnippet: span.inputSnippet,
    outputSnippet: span.outputSnippet,
    attributesSnippet: span.attributesSnippet,
  };
}

/** Transform a trace's spans into reader-mode entries. Mirrors the logic in
 *  trace-view/store/base.ts `getReaderListData` but is store-free so session
 *  view can reuse it per-trace. */
export function computeReaderEntries(spans: TraceViewSpan[], agentPaths: AgentPaths): ReaderListEntry[] {
  // Session view doesn't use condensed timeline selection, so we never filter by it.
  const listSpans = spans.filter((span) => span.spanType !== "DEFAULT");
  const pathInfoMap = computePathInfoMap(spans);

  const toLightweight = (span: TraceViewSpan): TraceViewListSpan =>
    spanToListSpan(span, pathInfoMap.get(span.spanId) ?? null);

  const mainAgentPath = agentPaths[0] ?? null;
  const isMainAgentSpan = (span: TraceViewSpan): boolean => {
    if (!mainAgentPath) return true;
    if (!span.path) return true;
    return span.path === mainAgentPath || span.path.startsWith(mainAgentPath + ".");
  };

  const entries: ReaderListEntry[] = [];
  let currentGroup: { path: string; spans: TraceViewSpan[] } | null = null;

  const flushGroup = () => {
    if (!currentGroup || currentGroup.spans.length === 0) return;
    const groupSpans = currentGroup.spans;
    const groupPath = currentGroup.path;

    const firstLlm = groupSpans.find((s) => s.spanType === "LLM" || s.spanType === "CACHED");
    if (!firstLlm) {
      for (const s of groupSpans) entries.push({ type: "span", span: toLightweight(s) });
      currentGroup = null;
      return;
    }

    const groupId = `group-${groupPath}-${groupSpans[0].spanId}`;
    let totalTokens = 0;
    let totalCost = 0;
    for (const s of groupSpans) {
      totalTokens += s.totalTokens;
      totalCost += s.totalCost;
    }

    const pathParts = groupPath.split(".");
    const groupName = pathParts[pathParts.length - 1] || groupSpans[0].name;

    entries.push({
      type: "group",
      groupId,
      name: groupName,
      path: groupPath,
      spans: groupSpans.map(toLightweight),
      firstLlmSpanId: firstLlm.spanId,
      startTime: groupSpans[0].startTime,
      endTime: groupSpans[groupSpans.length - 1].endTime,
      totalTokens,
      totalCost,
    });
    currentGroup = null;
  };

  for (const span of listSpans) {
    if (isMainAgentSpan(span)) {
      flushGroup();
      entries.push({ type: "span", span: toLightweight(span) });
    } else {
      if (currentGroup) currentGroup.spans.push(span);
      else currentGroup = { path: span.path, spans: [span] };
    }
  }
  flushGroup();

  return entries;
}

// ---------- Flat row synthesis ----------

export type SessionFlatRow =
  | { type: "trace-header"; trace: TraceRow; expanded: boolean }
  | { type: "trace-loading"; traceId: string }
  | { type: "trace-error"; traceId: string; error: string }
  | { type: "trace-empty"; traceId: string }
  | { type: "user-input"; traceId: string }
  | { type: "span"; traceId: string; span: TraceViewListSpan }
  | { type: "group-header"; traceId: string; group: ReaderListGroup; collapsed: boolean }
  | { type: "group-span"; traceId: string; group: ReaderListGroup; span: TraceViewListSpan; isLast: boolean };

interface BuildFlatRowsOpts {
  traces: TraceRow[];
  traceSpans: Record<string, TraceViewSpan[]>;
  traceSpansLoading: Record<string, boolean>;
  traceSpansError: Record<string, string | undefined>;
  traceAgentPaths: Record<string, AgentPaths>;
  expandedTraceIds: Set<string>;
  /** Namespaced `${traceId}::${groupId}` set of EXPANDED groups (default collapsed). */
  readerExpandedGroups: Set<string>;
  /** When set, a search is active: only matched traces appear, always expanded,
   *  with only matching spans (flat, no reader-mode groups). */
  searchResults?: Record<string, SessionSpansTraceResult>;
}

/** Build the hybrid (trace headers + spans) flat row list that drives the
 *  session panel virtualizer. */
export function buildSessionFlatRows(opts: BuildFlatRowsOpts): SessionFlatRow[] {
  const {
    traces,
    traceSpans,
    traceSpansLoading,
    traceSpansError,
    traceAgentPaths,
    expandedTraceIds,
    readerExpandedGroups,
    searchResults,
  } = opts;

  // --- Search mode: only matched traces, always expanded, flat spans ---
  if (searchResults) {
    return buildSearchFlatRows(traces, searchResults);
  }

  // --- Normal mode ---
  const rows: SessionFlatRow[] = [];

  for (const trace of traces) {
    const expanded = expandedTraceIds.has(trace.id);
    rows.push({ type: "trace-header", trace, expanded });

    if (!expanded) continue;

    const error = traceSpansError[trace.id];
    if (error) {
      rows.push({ type: "trace-error", traceId: trace.id, error });
      continue;
    }

    const loading = traceSpansLoading[trace.id];
    const spans = traceSpans[trace.id];
    if (loading && !spans) {
      rows.push({ type: "trace-loading", traceId: trace.id });
      continue;
    }

    if (!spans) {
      rows.push({ type: "trace-loading", traceId: trace.id });
      continue;
    }

    if (spans.length === 0) {
      rows.push({ type: "trace-empty", traceId: trace.id });
      continue;
    }

    rows.push({ type: "user-input", traceId: trace.id });

    const entries = computeReaderEntries(spans, traceAgentPaths[trace.id] ?? []);
    for (const entry of entries) {
      if (entry.type === "span") {
        rows.push({ type: "span", traceId: trace.id, span: entry.span });
      } else {
        const nsKey = `${trace.id}::${entry.groupId}`;
        const collapsed = !readerExpandedGroups.has(nsKey);
        rows.push({ type: "group-header", traceId: trace.id, group: entry, collapsed });
        if (!collapsed) {
          const childSpans = entry.spans.slice(1);
          for (let i = 0; i < childSpans.length; i++) {
            rows.push({
              type: "group-span",
              traceId: trace.id,
              group: entry,
              span: childSpans[i],
              isLast: i === childSpans.length - 1,
            });
          }
        }
      }
    }
  }

  return rows;
}

function buildSearchFlatRows(
  traces: TraceRow[],
  searchResults: Record<string, SessionSpansTraceResult>
): SessionFlatRow[] {
  const rows: SessionFlatRow[] = [];

  for (const trace of traces) {
    const result = searchResults[trace.id];
    if (!result || result.spans.length === 0) continue;

    rows.push({ type: "trace-header", trace, expanded: true });

    const pathInfoMap = computePathInfoMap(result.spans);
    for (const span of result.spans) {
      if (span.spanType === "DEFAULT") continue;
      rows.push({
        type: "span",
        traceId: trace.id,
        span: spanToListSpan(span, pathInfoMap.get(span.spanId) ?? null),
      });
    }
  }

  return rows;
}
