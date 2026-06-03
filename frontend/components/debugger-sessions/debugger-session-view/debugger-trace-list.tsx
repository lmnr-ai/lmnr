"use client";

import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import TraceItem from "@/components/traces/session-view/session-panel/trace-item";
import { useSessionSpanPreviews } from "@/components/traces/session-view/session-panel/use-session-span-previews";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { buildSessionFlatRows, formatGap, type SessionFlatRow } from "@/components/traces/session-view/utils";
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

import RunComment from "./run-comment";
import { traceAnchorId } from "./session-outline/utils";
import { useDebuggerSessionViewStore } from "./store";

// Debugger-local pseudo-row: the agent-authored run note, rendered as a
// NON-sticky row above its trace-header (matching the user's 0b1f5435c layout
// where the note scrolls away and only the compact header bar pins).
type DebuggerFlatRow = SessionFlatRow | { type: "run-note"; traceId: string };

/** Sticky trace-header height; scroll offset so headers land below it. */
const STICKY_HEADER_HEIGHT = 36;

interface DebuggerTraceListProps {
  // The page-owned scroll container (shared with the outline). The virtualizer
  // binds to it so the whole article scrolls as one with the rest of the page.
  scrollEl: HTMLElement | null;
  projectId?: string;
}

/**
 * Virtualized trace list for the DEBUGGER article column. Reuses every shared
 * session-view piece (`buildSessionFlatRows`, `TraceItem`, transcript items,
 * preview/trace-IO fetchers) and the base composed store, but binds the TanStack
 * virtualizer to an EXTERNAL page scroll element instead of owning its own
 * `overflow-y-auto` container — so the outline + article share one scroll context
 * (the user's `0b1f5435c` layout). The regular `session-panel/list.tsx` is left
 * untouched; this is a debugger-local composition off the same machinery.
 *
 * Differences vs the regular list: no session timeline → no visible-time-range
 * reporting and no scroll-to-group; run notes ride inside each TraceItem via the
 * optional debugger store. Sticky trace headers are preserved.
 */
export default function DebuggerTraceList({ scrollEl, projectId }: DebuggerTraceListProps) {
  const {
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
  } = useSessionViewBaseStore(
    (s) => ({
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

  // Note text per trace; a stable string signature drives row injection so the
  // rows rebuild when a note appears/changes (e.g. live via trace_update).
  const noteSignature = useDebuggerSessionViewStore((s) =>
    s.traces.map((t) => `${t.id}:${s.noteForTrace(t.id) ? 1 : 0}`).join("|")
  );
  const noteForTrace = useDebuggerSessionViewStore((s) => s.noteForTrace);

  const baseRows = useMemo(
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

  // Inject a non-sticky run-note row before each trace-header that has a note.
  const flatRows = useMemo<DebuggerFlatRow[]>(() => {
    const out: DebuggerFlatRow[] = [];
    for (const row of baseRows) {
      if (row.type === "trace-header" && noteForTrace(row.trace.id)) {
        out.push({ type: "run-note", traceId: row.trace.id });
      }
      out.push(row);
    }
    return out;
    // noteSignature is the change-trigger for note presence; noteForTrace is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseRows, noteSignature]);

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

  // Stable `getItemKey` via a ref so the callback identity doesn't change when
  // `flatRows` rebuilds (lets TanStack track items across expand/collapse shifts).
  const flatRowsRef = useRef(flatRows);
  flatRowsRef.current = flatRows;
  const getItemKey = useCallback((index: number) => {
    const row = flatRowsRef.current[index];
    if (!row) return index;
    switch (row.type) {
      case "run-note":
        return `rn::${row.traceId}`;
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

  const estimateSize = useCallback((index: number) => {
    const row = flatRowsRef.current[index];
    if (!row) return 70;
    switch (row.type) {
      case "run-note":
        return 80;
      case "trace-header":
        return row.expanded ? 36 : 280;
      case "group-header":
        return 36;
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
    // Bind to the external page scroll container (shared with the outline).
    getScrollElement: () => scrollEl,
    estimateSize,
    overscan: 20,
    rangeExtractor,
    getItemKey,
    paddingStart: 0,
  });

  const items = virtualizer.getVirtualItems();

  // Declarative scroll-to-selected-span: when a span is selected and its trace's
  // rows have settled, scroll it to center. Fires once per selection.
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
    if (idx === -1) return;

    lastScrolledSpanIdRef.current = selectedSpan.spanId;
    const rafId = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(idx, { align: "center" });
    });
    return () => cancelAnimationFrame(rafId);
  }, [selectedSpan, flatRows, virtualizer]);

  // --- Preview fetching (batched across traces) — same derivation as the
  // regular list, scoped to the virtualizer window. ---
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
        if (row.collapsed && group.lastLlmSpanId) {
          pushUnique(visible, row.traceId, group.lastLlmSpanId);
        }
      }
    }
    return { visibleSpanIdsByTrace: visible, inputSpanIdsByTrace: inputs };
  }, [rangeStart, rangeEnd, flatRows]);

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

  const allSpansById = useMemo(() => {
    const map = new Map<string, TraceViewSpan>();
    for (const spans of Object.values(traceSpans)) {
      for (const s of spans) map.set(s.spanId, s);
    }
    return map;
  }, [traceSpans]);

  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds);

  return (
    <div className="relative w-full" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
      {items.map((virtualRow) => {
        const row = flatRows[virtualRow.index];
        if (!row) return null;

        const activeSticky = isActiveSticky(virtualRow.index);

        const positionStyle: React.CSSProperties = activeSticky
          ? { position: "sticky", top: 0, background: "hsl(var(--background))" }
          : { position: "absolute", top: 0, transform: `translateY(${virtualRow.start}px)` };

        if (row.type === "trace-header") {
          positionStyle.zIndex = virtualRow.index + 1;
        }

        // Anchor the collapsed trace header so the outline's "Trace N" chip can
        // scroll to it (the chip links to traceAnchorId(traceId)).
        const anchorId = row.type === "trace-header" ? traceAnchorId(row.trace.id) : undefined;

        return (
          <div
            key={virtualRow.key}
            ref={virtualizer.measureElement}
            data-index={virtualRow.index}
            id={anchorId}
            style={{ ...positionStyle, left: 0, width: "100%", scrollMarginTop: STICKY_HEADER_HEIGHT }}
          >
            {row.type === "run-note" ? (
              <div className="px-1 pb-3 pt-1">
                <RunComment traceId={row.traceId} />
              </div>
            ) : row.type === "trace-header" ? (
              <TraceItem
                trace={row.trace}
                expanded={row.expanded}
                traceIndex={traceIndexById.get(row.trace.id) ?? 0}
                totalTraces={traces.length}
                onToggle={() => toggleTraceExpanded(row.trace.id)}
                traceIO={traceIO[row.trace.id]}
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
                  row.type === "trace-expanded-end" ? "h-12" : "h-10"
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
  );
}
