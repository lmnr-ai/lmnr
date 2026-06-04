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
import { SpanCard } from "@/components/traces/trace-view/tree/span-card";
import {
  filterToViewport,
  useReportVisibleTimeRange,
} from "@/components/traces/trace-view/use-report-visible-time-range";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatDuration } from "@/lib/utils";

import { useSessionViewBaseStore } from "../store";
import { buildSessionFlatRows } from "../utils";
import TraceCollapsedBody from "./trace-collapsed-body.tsx";
import TraceItem from "./trace-item.tsx";
import { useSessionSpanPreviews } from "./use-session-span-previews.ts";

/** Sticky trace-header height; used as scroll offset so headers land below it. */
const STICKY_HEADER_HEIGHT = 36;

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
    traceViewModes,
    traceShowTreeContent,
    selectedSpan,
    searchResults,
    toggleTraceExpanded,
    toggleTranscriptGroup,
    toggleSpanCollapse,
    setSelectedSpan,
    setScrollTimeRange,
    scrollToGroup,
    consumeScrollToGroup,
    scrollToTraceId,
    consumeScrollToTrace,
  } = useSessionViewBaseStore(
    (s) => ({
      projectId: s.projectId,
      traces: s.traces,
      traceSpans: s.traceSpans,
      traceSpansLoading: s.traceSpansLoading,
      traceSpansError: s.traceSpansError,
      expandedTraceIds: s.expandedTraceIds,
      transcriptExpandedGroups: s.transcriptExpandedGroups,
      traceViewModes: s.traceViewModes,
      traceShowTreeContent: s.traceShowTreeContent,
      selectedSpan: s.selectedSpan,
      searchResults: s.searchResults,
      toggleTraceExpanded: s.toggleTraceExpanded,
      toggleTranscriptGroup: s.toggleTranscriptGroup,
      toggleSpanCollapse: s.toggleSpanCollapse,
      setSelectedSpan: s.setSelectedSpan,
      setScrollTimeRange: s.setScrollTimeRange,
      scrollToGroup: s.scrollToGroup,
      consumeScrollToGroup: s.consumeScrollToGroup,
      scrollToTraceId: s.scrollToTraceId,
      consumeScrollToTrace: s.consumeScrollToTrace,
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
        traceViewModes,
      }),
    [
      traces,
      traceSpans,
      traceSpansLoading,
      traceSpansError,
      expandedTraceIds,
      transcriptExpandedGroups,
      searchResults,
      traceViewModes,
    ]
  );

  const traceIndexById = useMemo(() => {
    const map = new Map<string, number>();
    traces.forEach((t, idx) => map.set(t.id, idx + 1));
    return map;
  }, [traces]);

  // Resolve a TraceRow by id for the trace-collapsed-body row (which carries
  // only traceId to stay light + avoid stale snapshots).
  const traceById = useMemo(() => {
    const map = new Map<string, (typeof traces)[number]>();
    for (const t of traces) map.set(t.id, t);
    return map;
  }, [traces]);

  // Every trace-header row is sticky — collapsed AND expanded. The collapsed
  // body is its own (non-sticky) row, so a stuck header pins just the ~40px bar.
  const stickyIndexes = useMemo(
    () =>
      flatRows.reduce<number[]>((acc, row, idx) => {
        if (row.type === "trace-header") acc.push(idx);
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
  // Read latest content-visibility in estimateSize without re-creating it.
  const traceShowTreeContentRef = useRef(traceShowTreeContent);
  traceShowTreeContentRef.current = traceShowTreeContent;
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
      case "tree-span":
        return `ts::${row.traceId}::${row.span.spanId}`;
      case "trace-collapsed-body":
        return `tcb::${row.traceId}`;
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
        // Uniform header height in BOTH states (the collapsed body is its own row).
        return 36;
      case "trace-collapsed-body":
        // Input preview + last-span preview (~the old 280 collapsed card minus
        // the ~40px header). The virtualizer measures the real height.
        return 240;
      case "group-header":
        return 36;
      case "tree-span":
        // Content-visible trees show an LLM preview (~taller) — estimate higher
        // so initial paint re-anchors less; collapsed-content rows stay 36.
        return traceShowTreeContentRef.current[row.traceId] !== false ? 56 : 36;
      case "trace-error":
      case "trace-empty":
        return 42;
      case "trace-collapsed-end":
        return 40;
      case "trace-expanded-end":
        return 48;
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
    paddingStart: 0,
  });

  const items = virtualizer.getVirtualItems();

  // --- Visible time range for the timeline's scroll indicator ---
  //
  // Only rows that actually carry a meaningful time range contribute. Spacers
  // (trace-collapsed-end / trace-expanded-end), user-input, and loading/error/
  // empty rows are skipped — otherwise a 1-px sliver of an adjacent spacer
  // would drag min/max to that neighbor trace's full extent.
  const scrollOffset = virtualizer.scrollOffset ?? 0;
  const viewportHeight = virtualizer.scrollRect?.height ?? 0;

  const { visibleStartTime, visibleEndTime } = useMemo(() => {
    const inViewport = filterToViewport(items, scrollOffset, viewportHeight);
    let min = Infinity;
    let max = -Infinity;
    for (const item of inViewport) {
      const row = flatRows[item.index];
      if (!row) continue;
      let startStr: string | undefined;
      let endStr: string | undefined;
      if (row.type === "span" || row.type === "group-span" || row.type === "tree-span") {
        startStr = row.span.startTime;
        endStr = row.span.endTime;
      } else if (row.type === "group-header") {
        startStr = row.group.startTime;
        endStr = row.group.endTime;
      } else if (row.type === "trace-header") {
        startStr = row.trace.startTime;
        endStr = row.trace.endTime;
      }
      if (startStr && endStr) {
        const s = new Date(startStr).getTime();
        const e = new Date(endStr).getTime();
        if (s < min) min = s;
        if (e > max) max = e;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return { visibleStartTime: undefined, visibleEndTime: undefined };
    }
    return { visibleStartTime: min, visibleEndTime: max };
  }, [items, flatRows, scrollOffset, viewportHeight]);

  useReportVisibleTimeRange({
    start: visibleStartTime,
    end: visibleEndTime,
    setTimeRange: setScrollTimeRange,
  });

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
        (r.type === "span" || r.type === "group-span" || r.type === "tree-span") &&
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

  // Scroll the matching group-header row into view in response to a click on
  // a subagent block in the session timeline. The scroll lands 36px below the
  // top to clear the sticky trace-header.
  //
  // Two passes are needed: `getOffsetForIndex` returns estimates for unmeasured
  // rows (estimateSize=70 vs real heights), so the first scroll lands close
  // enough to force measurement, and the second scroll uses the now-accurate
  // offset.
  useEffect(() => {
    if (!scrollToGroup) return;
    const idx = flatRows.findIndex(
      (r) =>
        r.type === "group-header" && r.traceId === scrollToGroup.traceId && r.group.groupId === scrollToGroup.groupId
    );
    if (idx === -1) {
      consumeScrollToGroup();
      return;
    }

    const scrollWithOffset = () => {
      const offset = virtualizer.getOffsetForIndex(idx, "start")?.[0];
      if (offset !== undefined) virtualizer.scrollToOffset(Math.max(0, offset - STICKY_HEADER_HEIGHT));
    };

    scrollWithOffset();
    const rafId = requestAnimationFrame(() => {
      scrollWithOffset();
      consumeScrollToGroup();
    });
    return () => cancelAnimationFrame(rafId);
  }, [scrollToGroup, flatRows, virtualizer, consumeScrollToGroup]);

  // Scroll the just-collapsed trace's header into view. Keyed on flatRows so it
  // runs AFTER the collapse rebuilds rows (expanded body rows removed, indices
  // shifted). `align:"auto"` scrolls ONLY when the header is out of view — no
  // jump if it's already visible, never snaps to list top. Two-pass rAF re-runs
  // after the freshly-estimated post-collapse rows are measured, so the header
  // lands correctly even though surrounding offsets were estimates.
  useEffect(() => {
    if (!scrollToTraceId) return;
    const idx = flatRows.findIndex((r) => r.type === "trace-header" && r.trace.id === scrollToTraceId);
    if (idx === -1) {
      consumeScrollToTrace();
      return;
    }
    virtualizer.scrollToIndex(idx, { align: "auto" });
    const rafId = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(idx, { align: "auto" });
      consumeScrollToTrace();
    });
    return () => cancelAnimationFrame(rafId);
  }, [scrollToTraceId, flatRows, virtualizer, consumeScrollToTrace]);

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

      if (row.type === "span" || row.type === "group-span" || row.type === "tree-span") {
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
    <div
      ref={scrollRef}
      className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar px-2"
    >
      <div
        className="relative mx-auto w-full max-w-4xl 2xl:max-w-6xl"
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
        }}
      >
        {items.map((virtualRow) => {
          const row = flatRows[virtualRow.index];
          if (!row) return null;

          const activeSticky = isActiveSticky(virtualRow.index);

          const positionStyle: React.CSSProperties = activeSticky
            ? { position: "sticky", top: 0, background: "hsl(var(--background))" }
            : { position: "absolute", top: 0, transform: `translateY(${virtualRow.start}px)` };

          if (row.type === "trace-header") {
            // Lift the whole sticky-header band ABOVE any row-internal z-index
            // (span-type icons / tree connectors carry up to z-30) so content
            // scrolling under a stuck header can't paint over it. The +index
            // preserves swap ordering between two adjacent stuck headers.
            positionStyle.zIndex = 100 + virtualRow.index;
          }

          return (
            <div
              key={virtualRow.key}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
              data-vrow
              style={{ ...positionStyle, left: 0, width: "100%" }}
            >
              {row.type === "trace-header" ? (
                <TraceItem
                  trace={row.trace}
                  expanded={row.expanded}
                  traceIndex={traceIndexById.get(row.trace.id) ?? 0}
                  totalTraces={traces.length}
                  onToggle={() => toggleTraceExpanded(row.trace.id)}
                />
              ) : row.type === "trace-collapsed-body" ? (
                (() => {
                  const t = traceById.get(row.traceId);
                  return t ? <TraceCollapsedBody trace={t} traceIO={traceIO[row.traceId]} /> : null;
                })()
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
                    row.type === "trace-expanded-end" ? "h-12" : "h-10"
                  )}
                >
                  <div className="w-full border-b" />
                  {formatDuration(row.gapMs) && (
                    <span className="text-xs text-muted-foreground shrink-0 px-2">{formatDuration(row.gapMs)}</span>
                  )}
                  <div className="w-full border-b" />
                </div>
              ) : row.type === "user-input" ? (
                <InputItem
                  text={traceIO[row.traceId]?.inputPreview ?? null}
                  isLoading={traceIO[row.traceId] === undefined}
                  className="rounded-lg"
                />
              ) : row.type === "group-header" ? (
                <AgentGroupHeader
                  group={row.group}
                  collapsed={row.collapsed}
                  previews={previews}
                  inputPreviews={userInputs}
                  agentNames={agentNames}
                  className="mx-0"
                  onToggle={() => toggleTranscriptGroup(row.traceId, row.group.groupId)}
                />
              ) : row.type === "group-span" ? (
                <GroupChildWrapper isLast={row.isLast} className="mx-0">
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
              ) : row.type === "tree-span" ? (
                <SpanCard
                  span={row.span}
                  branchMask={row.branchMask}
                  depth={row.depth}
                  hasChildren={row.hasChildren}
                  output={previews[row.span.spanId]}
                  showTreeContent={traceShowTreeContent[row.traceId] ?? true}
                  isSelected={
                    !!selectedSpan && selectedSpan.traceId === row.traceId && selectedSpan.spanId === row.span.spanId
                  }
                  onSpanSelect={(s) => s && setSelectedSpan({ traceId: row.traceId, spanId: s.spanId })}
                  onToggleCollapse={(spanId) => toggleSpanCollapse(row.traceId, spanId)}
                />
              ) : (
                <SpanItem
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
