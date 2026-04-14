"use client";

import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronDown, ChevronsRight, Copy } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import AdvancedSearch from "@/components/common/advanced-search";
import { useBatchedTraceIO } from "@/components/traces/sessions-table/use-batched-trace-io";
import { computeTraceStats, StatsShields } from "@/components/traces/stats-shields";
import { AgentGroupHeader } from "@/components/traces/trace-view/list/agent-group-item";
import ListItem from "@/components/traces/trace-view/list/list-item";
import { UserInputItem } from "@/components/traces/trace-view/list/user-input-item";
import { filterColumns } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { type Filter } from "@/lib/actions/common/filters";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import SessionTimeline from "./session-timeline";
import SessionTimelineToggle from "./session-timeline/timeline-toggle";
import { useSessionViewStore } from "./store";
import TraceItem from "./trace-item";
import { useSessionSpanPreviews } from "./use-session-span-previews";
import { buildSessionFlatRows, type SessionFlatRow } from "./utils";

interface SessionPanelProps {
  onClose: () => void;
}

export default function SessionPanel({ onClose }: SessionPanelProps) {
  const { toast } = useToast();

  const {
    session,
    projectId,
    traces,
    isTracesLoading,
    tracesError,
    traceSpans,
    traceSpansLoading,
    traceSpansError,
    traceAgentPaths,
    expandedTraceIds,
    readerExpandedGroups,
    selectedSpan,
    searchResults,
    isSearchLoading,
    searchSessionSpans,
    clearSearch,
    toggleTraceExpanded,
    toggleReaderGroup,
    setSelectedSpan,
    sessionTimelineEnabled,
    setSessionTimelineEnabled,
  } = useSessionViewStore(
    (s) => ({
      session: s.session,
      projectId: s.projectId,
      traces: s.traces,
      isTracesLoading: s.isTracesLoading,
      tracesError: s.tracesError,
      traceSpans: s.traceSpans,
      traceSpansLoading: s.traceSpansLoading,
      traceSpansError: s.traceSpansError,
      traceAgentPaths: s.traceAgentPaths,
      expandedTraceIds: s.expandedTraceIds,
      readerExpandedGroups: s.readerExpandedGroups,
      selectedSpan: s.selectedSpan,
      searchResults: s.searchResults,
      isSearchLoading: s.isSearchLoading,
      searchSessionSpans: s.searchSessionSpans,
      clearSearch: s.clearSearch,
      toggleTraceExpanded: s.toggleTraceExpanded,
      toggleReaderGroup: s.toggleReaderGroup,
      setSelectedSpan: s.setSelectedSpan,
      sessionTimelineEnabled: s.sessionTimelineEnabled,
      setSessionTimelineEnabled: s.setSessionTimelineEnabled,
    }),
    shallow
  );

  const isSearchActive = !!searchResults;

  const flatRows: SessionFlatRow[] = useMemo(
    () =>
      buildSessionFlatRows({
        traces,
        traceSpans,
        traceSpansLoading,
        traceSpansError,
        traceAgentPaths,
        expandedTraceIds,
        readerExpandedGroups,
        searchResults,
      }),
    [
      traces,
      traceSpans,
      traceSpansLoading,
      traceSpansError,
      traceAgentPaths,
      expandedTraceIds,
      readerExpandedGroups,
      searchResults,
    ]
  );

  const traceIndexById = useMemo(() => {
    const map = new Map<string, number>();
    traces.forEach((t, idx) => map.set(t.id, idx + 1));
    return map;
  }, [traces]);

  // Indices of flat rows eligible to stick (expanded trace-header rows).
  // Matches the pattern used by `sessions-virtual-list.tsx` — rangeExtractor
  // forces the current active sticky row into the rendered range, and the
  // renderer positions it with `position: sticky` instead of `translateY`.
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
      if (stickyIndexes.length === 0) return defaultRangeExtractor(range);

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
  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 42,
    overscan: 20,
    rangeExtractor,
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
  // grouped by trace. We include:
  //   - visible "span" / "group-span" rows
  //   - "group-header" firstLlmSpanId (as an input-span for userInputs)
  //   - For collapsed trace-headers in view: the first and last displayable
  //     span IDs (used by TraceItem's preview).
  //
  // We use a stable key (via the hook's internal string compare) so scroll
  // jitter doesn't trigger refetches.
  const rangeStart = items[0]?.index ?? 0;
  const rangeEnd = items[items.length - 1]?.index ?? -1;

  const { visibleSpanIdsByTrace, inputSpanIdsByTrace } = useMemo(() => {
    const visible: Record<string, string[]> = {};
    const inputs: Record<string, string[]> = {};
    const pushUnique = (map: Record<string, string[]>, traceId: string, spanId: string) => {
      if (!map[traceId]) map[traceId] = [];
      if (!map[traceId].includes(spanId)) map[traceId].push(spanId);
    };

    // Collapsed trace-headers no longer need per-span previews — the
    // `/traces/io` endpoint delivers the output text + span payload directly.
    for (let i = rangeStart; i <= rangeEnd; i++) {
      const row = flatRows[i];
      if (!row) continue;

      if (row.type === "span" || row.type === "group-span") {
        pushUnique(visible, row.traceId, row.span.spanId);
      } else if (row.type === "group-header") {
        if (row.group.firstLlmSpanId) {
          pushUnique(visible, row.traceId, row.group.firstLlmSpanId);
          pushUnique(inputs, row.traceId, row.group.firstLlmSpanId);
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

  const { previews, userInputs } = useSessionSpanPreviews({
    projectId,
    traces: previewTraces,
    visibleSpanIdsByTrace,
    inputSpanIdsByTrace,
    spanTypesByTrace,
  });

  // Main-agent input/output text + output span, fetched in one batched call
  // per session. Reuses the `/traces/io` endpoint + hook that powers the
  // sessions-table trace cards. Sessions can have many traces, so we pass
  // every traceId; the hook caches (LRU 200) and chunks into 100-ID batches.
  const traceIds = useMemo(() => traces.map((t) => t.id), [traces]);
  const { previews: traceIO } = useBatchedTraceIO(projectId, traceIds, { isIncludeSpanCounts: true });

  const handleSearch = useCallback(
    (filters: Filter[], search: string) => {
      if (!search && filters.length === 0) {
        clearSearch();
      } else {
        searchSessionSpans(filters, search);
      }
    },
    [searchSessionSpans, clearSearch]
  );

  const handleCopySessionId = async () => {
    if (!session?.sessionId) return;
    try {
      await navigator.clipboard.writeText(session.sessionId);
      toast({ title: "Copied session ID", duration: 1000 });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy session ID" });
    }
  };

  // Session aggregate stats — sessions-table gets these pre-aggregated from the
  // server, but here we only have the traces loaded, so sum them client-side.
  // Same shape/shield as `TraceStatsShields` for visual parity with trace view.
  const sessionStats = useMemo(() => (traces.length === 0 ? null : computeTraceStats(traces)), [traces]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1 border-r">
      {/* Header (figma 3711:5056). Button/icon sizing mirrors
          `trace-view/header/index.tsx` and `trace-dropdown.tsx` for visual
          consistency across the two side panels. */}
      <div className="relative flex flex-col gap-1.5 px-2 py-1.5 shrink-0">
        <div className="flex h-7 items-center justify-between">
          <div className="flex items-center gap-1 min-w-0">
            {/* Collapse / close side panel — matches trace-view: h-7 px-0.5 + w-5 h-5 icon */}
            <Button variant="ghost" className="h-7 px-0.5" onClick={onClose} aria-label="Close session view">
              <ChevronsRight className="w-5 h-5" />
            </Button>
            <span className="flex items-center h-7">
              <span className="text-base font-medium pl-2 flex-shrink-0">Session</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="h-6 px-1 hover:bg-secondary" disabled={!session?.sessionId}>
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={handleCopySessionId}>
                    <Copy size={14} />
                    Copy session ID
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </span>
          </div>
        </div>
        {/* TODO(session-view): add autocomplete suggestions from loaded/matched spans */}
        <AdvancedSearch
          mode="state"
          filters={filterColumns}
          resource="spans"
          value={{ filters: [], search: "" }}
          onSubmit={handleSearch}
          placeholder="Search text, name, id, tags..."
          className="w-full"
          disabled={isTracesLoading}
          options={{ suggestions: new Map(), disableHotKey: true }}
        />
        {traces.length > 0 && (
          <SessionTimelineToggle enabled={sessionTimelineEnabled} setEnabled={setSessionTimelineEnabled} />
        )}
      </div>

      {/* Body */}
      {tracesError ? (
        <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
          <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-destructive mb-2">Error Loading Session</h3>
          <p className="text-sm text-muted-foreground">{tracesError}</p>
        </div>
      ) : isTracesLoading && traces.length === 0 ? (
        <div className="flex flex-col gap-2 p-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <ResizablePanelGroup id="session-view-panels" orientation="vertical" className="flex-1 min-h-0">
          {sessionTimelineEnabled && (
            <>
              <ResizablePanel defaultSize={120} minSize={80}>
                <div className="border-t h-full">
                  <SessionTimeline />
                </div>
              </ResizablePanel>
              <ResizableHandle className="hover:bg-blue-400 z-10 transition-colors hover:scale-200" />
            </>
          )}
          <ResizablePanel className="flex flex-col flex-1 h-full overflow-hidden relative">
            <div
              className={cn(
                "flex items-center gap-2 pb-2 border-b box-border transition-[padding] duration-200",
                sessionTimelineEnabled ? "pt-2 pl-2 pr-2" : "pt-0 pl-2 pr-[96px]"
              )}
            >
              {sessionStats && <StatsShields stats={sessionStats} labelPrefix="Session" />}
            </div>
            <div
              ref={scrollRef}
              className="overflow-x-hidden overflow-y-auto grow relative h-full w-full styled-scrollbar"
            >
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
                  // Sticky row pins to the scroll container's top (the session
                  // header lives outside the scroll area, so top: 0 is correct).
                  const positionStyle: React.CSSProperties = activeSticky
                    ? { position: "sticky", top: 0 }
                    : { position: "absolute", top: 0, transform: `translateY(${virtualRow.start}px)` };

                  // z-index strategy for stacking sticky trace-headers:
                  //   - Trace-header rows get z-index = virtualRow.index + 1.
                  //     Later (higher-index) trace-headers stack ABOVE earlier
                  //     ones, so the incoming sticky visually overlays the
                  //     outgoing one during hand-off.
                  //   - All other rows (spans, group headers, loading/error)
                  //     stay at the default z=0 so that trace-headers always
                  //     render above them when their y positions collide.
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
                        />
                      ) : row.type === "trace-loading" ? (
                        <div className="flex flex-col gap-2 px-3 py-2">
                          <Skeleton className="h-5 w-full" />
                          <Skeleton className="h-5 w-3/4" />
                          <Skeleton className="h-5 w-2/3" />
                        </div>
                      ) : row.type === "trace-error" ? (
                        <div className="px-3 py-4 text-sm text-destructive">{row.error}</div>
                      ) : row.type === "trace-empty" ? (
                        <div className="px-3 py-4 text-sm text-muted-foreground">No spans found for this trace.</div>
                      ) : row.type === "user-input" ? (
                        // Reuse the same `inputPreview` the collapsed trace-item
                        // pill uses — one batched /traces/io fetch powers both
                        // states. FLAG: trace-view proper uses a different
                        // per-trace `/user-input` endpoint. They share the
                        // server-side extraction pipeline today; if that ever
                        // forks, session-view expanded will silently diverge from
                        // trace-view for the same trace.
                        <UserInputItem
                          text={traceIO[row.traceId]?.inputPreview ?? null}
                          isLoading={!traceIO[row.traceId]}
                        />
                      ) : row.type === "group-header" ? (
                        (() => {
                          // Mirror trace-view/list: prefer the LLM group-head's
                          // userInput when available, fall back to the first span's
                          // regular preview.
                          const firstSpan = row.group.spans[0];
                          const firstIsLlm =
                            firstSpan && (firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED");
                          const groupPreview = firstSpan
                            ? firstIsLlm && row.group.firstLlmSpanId
                              ? userInputs[row.group.firstLlmSpanId]
                              : previews[firstSpan.spanId]
                            : null;
                          return (
                            <AgentGroupHeader
                              group={row.group}
                              collapsed={row.collapsed}
                              preview={groupPreview}
                              onSpanSelect={(span) => setSelectedSpan({ traceId: row.traceId, spanId: span.spanId })}
                              onToggleGroup={(groupId) => toggleReaderGroup(row.traceId, groupId)}
                            />
                          );
                        })()
                      ) : row.type === "group-span" ? (
                        <div className={`mx-2 border-x bg-muted/80 ${row.isLast ? "border-b rounded-b-lg mb-1" : ""}`}>
                          <ListItem
                            span={row.span}
                            output={previews[row.span.spanId]}
                            onSpanSelect={(span) => setSelectedSpan({ traceId: row.traceId, spanId: span.spanId })}
                            isSelected={
                              !!selectedSpan &&
                              selectedSpan.traceId === row.traceId &&
                              selectedSpan.spanId === row.span.spanId
                            }
                          />
                        </div>
                      ) : (
                        <ListItem
                          span={row.span}
                          output={previews[row.span.spanId]}
                          onSpanSelect={(span) => setSelectedSpan({ traceId: row.traceId, spanId: span.spanId })}
                          isSelected={
                            !!selectedSpan &&
                            selectedSpan.traceId === row.traceId &&
                            selectedSpan.spanId === row.span.spanId
                          }
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
    </div>
  );
}
