"use client";

import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { type TraceViewSpan, type TranscriptListGroup } from "@/components/traces/trace-view/store/base";
import {
  AgentGroupHeader,
  GroupChildWrapper,
  InputItem,
  SpanItem,
} from "@/components/traces/trace-view/transcript/item";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

import { useSessionViewStore } from "../store";
import { buildSessionFlatRows, formatGap } from "../utils";
import TraceItem from "./trace-item.tsx";
import { useSessionSpanPreviews } from "./use-session-span-previews.ts";

/**
 * Virtualized body of the session panel. Reads everything it needs directly
 * from the session-view store — no props. Owns:
 *   - flat row construction from store state
 *   - TanStack virtualizer with sticky trace-header support
 *   - preview / trace-IO fetching driven by the visible window
 *   - scroll-to-selected-span behavior
 */
export default function SessionList() {
  const {
    projectId,
    traces,
    traceSpans,
    traceSpansLoading,
    traceSpansError,
    expandedTraceIds,
    transcriptExpandedGroups,
    selectedSpan,
    searchResults,
    toggleTraceExpanded,
    toggleTranscriptGroup,
    setSelectedSpan,
  } = useSessionViewStore(
    (s) => ({
      projectId: s.projectId,
      traces: s.traces,
      traceSpans: s.traceSpans,
      traceSpansLoading: s.traceSpansLoading,
      traceSpansError: s.traceSpansError,
      expandedTraceIds: s.expandedTraceIds,
      transcriptExpandedGroups: s.transcriptExpandedGroups,
      selectedSpan: s.selectedSpan,
      searchResults: s.searchResults,
      toggleTraceExpanded: s.toggleTraceExpanded,
      toggleTranscriptGroup: s.toggleTranscriptGroup,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );

  const flatRows = useMemo(
    () =>
      buildSessionFlatRows({
        traces,
        traceSpans,
        traceSpansLoading,
        traceSpansError,
        expandedTraceIds,
        transcriptExpandedGroups,
        searchResults,
      }),
    [traces, traceSpans, traceSpansLoading, traceSpansError, expandedTraceIds, transcriptExpandedGroups, searchResults]
  );

  const traceIndexById = useMemo(() => {
    const map = new Map<string, number>();
    traces.forEach((t, idx) => map.set(t.id, idx + 1));
    return map;
  }, [traces]);

  const stickyIndexes = useMemo(
    () =>
      flatRows.reduce<number[]>((acc, row, idx) => {
        if (row.type === "trace-header" && row.expanded) acc.push(idx);
        return acc;
      }, []),
    [flatRows]
  );

  const activeStickyIndexRef = useRef<number | null>(null);
  const isActiveSticky = useCallback((index: number) => activeStickyIndexRef.current === index, []);

  const rangeExtractor = useCallback(
    (range: Range) => {
      if (stickyIndexes.length === 0) {
        activeStickyIndexRef.current = null;
        return defaultRangeExtractor(range);
      }
      activeStickyIndexRef.current = [...stickyIndexes].reverse().find((index) => range.startIndex >= index) ?? null;
      const next = new Set([
        ...(activeStickyIndexRef.current !== null ? [activeStickyIndexRef.current] : []),
        ...defaultRangeExtractor(range),
      ]);
      return [...next].sort((a, b) => a - b);
    },
    [stickyIndexes]
  );

  const scrollRef = useRef<HTMLDivElement>(null);

  // Stable `getItemKey` callback identity: we look up via a ref so the
  // callback reference doesn't change when `flatRows` rebuilds. Stable keys
  // let TanStack's measurement cache track items across reorderings when
  // expand/collapse shifts indices.
  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;
  const getItemKey = useCallback((index: number) => {
    const row = flatRowsRef.current[index];
    if (!row) return index;
    switch (row.type) {
      case "trace-header":
        return `th::${row.trace.id}`;
      case "trace-loading":
        return `tl::${row.traceId}`;
      case "trace-error":
        return `te::${row.traceId}`;
      case "trace-empty":
        return `tm::${row.traceId}`;
      case "user-input":
        return `ui::${row.traceId}`;
      case "span":
        return `sp::${row.traceId}::${row.span.spanId}`;
      case "group-header":
        return `gh::${row.traceId}::${row.group.groupId}`;
      case "group-span":
        return `gs::${row.traceId}::${row.span.spanId}`;
      case "trace-collapsed-end":
        return `tcend::${row.traceId}`;
      case "trace-expanded-end":
        return `teend::${row.traceId}`;
    }
  }, []);

  // Per-row-type estimates near the median of actual rendered heights.
  // Keeping estimates close to actuals minimizes TanStack's scroll
  // re-anchoring on measure — which is the natural behavior we're leaning
  // on now (no override of shouldAdjustScrollPositionOnItemSizeChange).
  const estimateSize = useCallback((index: number) => {
    const row = flatRowsRef.current[index];
    if (!row) return 70;
    switch (row.type) {
      case "trace-header":
        return row.expanded ? 36 : 280;
      case "group-header":
        return 36;
      case "trace-error":
      case "trace-empty":
        return 42;
      case "trace-collapsed-end":
        return 50;
      case "trace-expanded-end":
        return 80;
      case "trace-loading":
      case "user-input":
      case "span":
      case "group-span":
        return 70;
    }
  }, []);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize,
    overscan: 20,
    rangeExtractor,
    getItemKey,
  });

  const items = virtualizer.getVirtualItems();

  // Declarative scroll-to-selected-span. When `selectedSpan` changes (e.g. via
  // the URL resolver in session-view-content), flat rows rebuild once the
  // trace's spans are loaded — at which point `findIndex` succeeds and we
  // scroll. Fires at most once per selection via `lastScrolledSpanIdRef`.
  const lastScrolledSpanIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedSpan) {
      lastScrolledSpanIdRef.current = null;
      return;
    }
    if (lastScrolledSpanIdRef.current === selectedSpan.spanId) return;

    const idx = flatRows.findIndex(
      (r) =>
        (r.type === "span" || r.type === "group-span") &&
        r.traceId === selectedSpan.traceId &&
        r.span.spanId === selectedSpan.spanId
    );
    if (idx === -1) return; // rows haven't settled yet; effect re-runs as flatRows changes

    lastScrolledSpanIdRef.current = selectedSpan.spanId;
    const rafId = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(idx, { align: "center" });
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedSpan, flatRows, virtualizer]);

  // --- Preview fetching (batched across traces) ---
  //
  // Derive the set of span IDs currently visible in the virtualizer window,
  // grouped by trace. We include visible "span" / "group-span" rows and
  // "group-header" firstLlmSpanId (as an input-span for userInputs).
  // Collapsed trace-headers don't need per-span previews — the `/traces/io`
  // endpoint delivers the output text + span payload directly.
  const rangeStart = items[0]?.index ?? 0;
  const rangeEnd = items[items.length - 1]?.index ?? -1;

  const { visibleSpanIdsByTrace, inputSpanIdsByTrace } = useMemo(() => {
    const visible: Record<string, string[]> = {};
    const inputs: Record<string, string[]> = {};
    const pushUnique = (map: Record<string, string[]>, traceId: string, spanId: string) => {
      if (!map[traceId]) map[traceId] = [];
      if (!map[traceId].includes(spanId)) map[traceId].push(spanId);
    };

    for (let i = rangeStart; i <= rangeEnd; i++) {
      const row = flatRows[i];
      if (!row) continue;

      if (row.type === "span" || row.type === "group-span") {
        pushUnique(visible, row.traceId, row.span.spanId);
      } else if (row.type === "group-header") {
        const group = row.group as TranscriptListGroup;
        if (group.firstLlmSpanId) {
          pushUnique(visible, row.traceId, group.firstLlmSpanId);
          pushUnique(inputs, row.traceId, group.firstLlmSpanId);
        }
        // Also fetch the last LLM span preview for collapsed groups
        if (row.collapsed && group.lastLlmSpanId) {
          pushUnique(visible, row.traceId, group.lastLlmSpanId);
        }
      }
    }
    return { visibleSpanIdsByTrace: visible, inputSpanIdsByTrace: inputs };
  }, [rangeStart, rangeEnd, flatRows]);

  // Span types per trace (used as a hint by the preview endpoint).
  const spanTypesByTrace = useMemo(() => {
    const out: Record<string, Record<string, string>> = {};
    for (const [tid, spans] of Object.entries(traceSpans)) {
      const types: Record<string, string> = {};
      for (const s of spans) types[s.spanId] = s.spanType;
      out[tid] = types;
    }
    return out;
  }, [traceSpans]);

  const previewTraces = useMemo(
    () => traces.map((t) => ({ id: t.id, startTime: t.startTime, endTime: t.endTime })),
    [traces]
  );

  const { previews, userInputs, agentNames } = useSessionSpanPreviews({
    projectId,
    traces: previewTraces,
    visibleSpanIdsByTrace,
    inputSpanIdsByTrace,
    spanTypesByTrace,
  });

  // Flat spanId → TraceViewSpan lookup across all loaded traces.
  const allSpansById = useMemo(() => {
    const map = new Map<string, TraceViewSpan>();
    for (const spans of Object.values(traceSpans)) {
      for (const s of spans) map.set(s.spanId, s);
    }
    return map;
  }, [traceSpans]);

  // Main-agent input/output text + output span, fetched in one batched call
  // per session. Reuses the `/traces/io` endpoint + hook that powers the
  // sessions-table trace cards. Sessions can have many traces, so we pass
  // every traceId; the hook caches (LRU 200) and chunks into 100-ID batches.
  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds);

  return (
    <div ref={scrollRef} className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar">
      <div
        className="relative"
        style={{
          height: virtualizer.getTotalSize(),
          width: "100%",
          position: "relative",
        }}
      >
        {items.map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (!row) return null;

          const activeSticky = isActiveSticky(virtualRow.index);

          const positionStyle: React.CSSProperties = activeSticky
            ? { position: "sticky", top: 0 }
            : { position: "absolute", top: 0, transform: `translateY(${virtualRow.start}px)` };

          if (row.type === "trace-header") {
            positionStyle.zIndex = virtualRow.index + 1;
          }

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              style={{ ...positionStyle, left: 0, width: "100%" }}
            >
              {row.type === "trace-header" ? (
                <TraceItem
                  trace={row.trace}
                  expanded={row.expanded}
                  traceIndex={traceIndexById.get(row.trace.id) ?? 0}
                  totalTraces={traces.length}
                  onToggle={() => toggleTraceExpanded(row.trace.id)}
                  traceIO={traceIO[row.trace.id]}
                  className="px-2"
                />
              ) : row.type === "trace-loading" ? (
                <div className="flex flex-col gap-2 py-2 px-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-3/4" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : row.type === "trace-error" ? (
                <div className="py-4 px-2 text-sm text-destructive">{row.error}</div>
              ) : row.type === "trace-empty" ? (
                <div className="py-4 px-2 text-sm text-muted-foreground">No spans found for this trace.</div>
              ) : row.type === "trace-collapsed-end" || row.type === "trace-expanded-end" ? (
                <div
                  className={cn(
                    "px-2 flex justify-center items-center",
                    row.type === "trace-expanded-end" ? "h-[80px]" : "h-[50px]"
                  )}
                >
                  <div className="w-full border-b" />
                  {formatGap(row.gapMs) && (
                    <span className="text-xs text-muted-foreground shrink-0 px-2">{formatGap(row.gapMs)}</span>
                  )}
                  <div className="w-full border-b" />
                </div>
              ) : row.type === "user-input" ? (
                <InputItem
                  text={traceIO[row.traceId]?.inputPreview ?? null}
                  isLoading={!traceIO[row.traceId]}
                  className="px-4"
                />
              ) : row.type === "group-header" ? (
                <AgentGroupHeader
                  group={row.group}
                  collapsed={row.collapsed}
                  previews={previews}
                  inputPreviews={userInputs}
                  agentNames={agentNames}
                  className="my-1 mx-4"
                  onToggle={() => toggleTranscriptGroup(row.traceId, row.group.groupId)}
                />
              ) : row.type === "group-span" ? (
                <GroupChildWrapper isLast={row.isLast} className="mx-4">
                  <SpanItem
                    span={row.span}
                    fullSpan={allSpansById.get(row.span.spanId)}
                    output={previews[row.span.spanId]}
                    onSpanSelect={(s) => setSelectedSpan({ traceId: row.traceId, spanId: s.spanId })}
                    isSelected={
                      !!selectedSpan && selectedSpan.traceId === row.traceId && selectedSpan.spanId === row.span.spanId
                    }
                    inGroup
                  />
                </GroupChildWrapper>
              ) : (
                <SpanItem
                  className="px-3"
                  span={row.span}
                  fullSpan={allSpansById.get(row.span.spanId)}
                  output={previews[row.span.spanId]}
                  onSpanSelect={(s) => setSelectedSpan({ traceId: row.traceId, spanId: s.spanId })}
                  isSelected={
                    !!selectedSpan && selectedSpan.traceId === row.traceId && selectedSpan.spanId === row.span.spanId
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
