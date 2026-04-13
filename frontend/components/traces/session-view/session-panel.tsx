"use client";

import { defaultRangeExtractor, type Range, useVirtualizer } from "@tanstack/react-virtual";
import { AlertTriangle, ChevronDown, ChevronsRight, Copy, Search } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";
import { shallow } from "zustand/shallow";

import { AgentGroupHeader } from "@/components/traces/trace-view/list/agent-group-item";
import ListItem from "@/components/traces/trace-view/list/list-item";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";

import { useSessionViewStore } from "./store";
import TraceHeaderItem from "./trace-header-item";
import { useSessionSpanPreviews } from "./use-session-span-previews";
import { buildSessionFlatRows, type SessionFlatRow } from "./utils";

interface SessionPanelProps {
  onClose: () => void;
}

export default function SessionPanel({ onClose }: SessionPanelProps) {
  const { toast } = useToast();

  // TODO(session-view): add session timeline (figma shows a mini-gantt at the
  // top of the session panel). Skipped for now per spec.

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
    toggleTraceExpanded,
    toggleReaderGroup,
    setSelectedSpan,
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
      toggleTraceExpanded: s.toggleTraceExpanded,
      toggleReaderGroup: s.toggleReaderGroup,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );

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
      }),
    [traces, traceSpans, traceSpansLoading, traceSpansError, traceAgentPaths, expandedTraceIds, readerExpandedGroups]
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

  // --- Preview fetching (batched across traces) ---
  //
  // Derive the set of span IDs currently visible in the virtualizer window,
  // grouped by trace. We include:
  //   - visible "span" / "group-span" rows
  //   - "group-header" firstLlmSpanId (as an input-span for userInputs)
  //   - For collapsed trace-headers in view: the first and last displayable
  //     span IDs (used by TraceHeaderItem's preview).
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
      } else if (row.type === "trace-header" && !row.expanded) {
        // Collapsed trace-headers render first/last span previews inside
        // TraceHeaderItem — fetch them eagerly.
        const spans = traceSpans[row.trace.id];
        if (!spans) continue;
        const displaySpans = spans.filter((s) => s.spanType !== "DEFAULT");
        if (displaySpans.length === 0) continue;
        pushUnique(visible, row.trace.id, displaySpans[0].spanId);
        if (displaySpans.length > 1) {
          pushUnique(visible, row.trace.id, displaySpans[displaySpans.length - 1].spanId);
        }
      }
    }
    return { visibleSpanIdsByTrace: visible, inputSpanIdsByTrace: inputs };
  }, [rangeStart, rangeEnd, flatRows, traceSpans]);

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

  const handleCopySessionId = async () => {
    if (!session?.sessionId) return;
    try {
      await navigator.clipboard.writeText(session.sessionId);
      toast({ title: "Copied session ID", duration: 1000 });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy session ID" });
    }
  };

  // Derived session-level aggregates from the loaded traces. Figma header
  // shows a combined stats pill (duration / tokens / cost).
  const sessionAggregates = useMemo(() => {
    if (traces.length === 0) return null;
    let totalTokens = 0;
    let totalCost = 0;
    let earliestStart: string | undefined;
    let latestEnd: string | undefined;
    for (const t of traces) {
      totalTokens += t.totalTokens ?? 0;
      totalCost += t.totalCost ?? 0;
      if (!earliestStart || new Date(t.startTime) < new Date(earliestStart)) earliestStart = t.startTime;
      if (!latestEnd || new Date(t.endTime) > new Date(latestEnd)) latestEnd = t.endTime;
    }
    return { totalTokens, totalCost, startTime: earliestStart, endTime: latestEnd };
  }, [traces]);

  return (
    <div className="flex flex-col h-full w-full overflow-hidden flex-1 border-r">
      {/* Header (figma 3711:5056). Button/icon sizing mirrors
          `trace-view/header/index.tsx` and `trace-dropdown.tsx` for visual
          consistency across the two side panels. */}
      <div className="flex flex-col gap-1.5 px-2 py-1.5 border-b shrink-0">
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
            {sessionAggregates && (
              <div className="flex items-center gap-2 h-5 rounded-md bg-muted px-1.5 shrink-0 ml-1">
                <SpanStatsShield
                  variant="inline"
                  startTime={sessionAggregates.startTime ?? new Date().toISOString()}
                  endTime={sessionAggregates.endTime ?? new Date().toISOString()}
                  tokens={sessionAggregates.totalTokens}
                  cost={sessionAggregates.totalCost}
                />
              </div>
            )}
          </div>
          {/* TODO(session-view): expand-to-fullscreen slot (figma reserves 28x28 on the right). Not in scope per spec. */}
          <div className="size-7 shrink-0" />
        </div>
        {/* TODO(session-view): wire up an AdvancedSearch component here (see
            `components/common/advanced-search`). For now this is a visual-only
            placeholder so the header matches the figma. */}
        <div className="flex items-center gap-2 h-8 rounded-md border border-[#2b2b31] bg-[rgba(34,34,38,0.8)] px-1.5 w-full">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            type="text"
            disabled
            readOnly
            placeholder="Search text, name, id, tags..."
            className="flex-1 bg-transparent border-0 outline-none text-[12px] text-muted-foreground placeholder:text-muted-foreground cursor-not-allowed"
          />
        </div>
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
                    <TraceHeaderItem
                      trace={row.trace}
                      expanded={row.expanded}
                      traceIndex={traceIndexById.get(row.trace.id) ?? 0}
                      totalTraces={traces.length}
                      onToggle={() => toggleTraceExpanded(row.trace.id)}
                      previews={previews}
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
                    // TODO(session-view): render `UserInputItem` — needs per-trace
                    // user-input fetch. Skipped for initial version.
                    <div className="hidden" />
                  ) : row.type === "group-header" ? (
                    (() => {
                      // Mirror trace-view/list: prefer the LLM group-head's
                      // userInput when available, fall back to the first span's
                      // regular preview.
                      const firstSpan = row.group.spans[0];
                      const firstIsLlm = firstSpan && (firstSpan.spanType === "LLM" || firstSpan.spanType === "CACHED");
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
      )}
    </div>
  );
}
