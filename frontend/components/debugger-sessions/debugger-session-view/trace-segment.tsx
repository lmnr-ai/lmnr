"use client";

import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import TraceCollapsedBody from "@/components/traces/session-view/session-panel/trace-collapsed-body";
import TraceItem from "@/components/traces/session-view/session-panel/trace-item";
import { useSessionViewBaseStore } from "@/components/traces/session-view/store";
import { computeTranscriptEntries } from "@/components/traces/session-view/utils";
import { type TraceIOEntry } from "@/components/traces/sessions-table/use-batched-trace-io";
import {
  type TraceViewListSpan,
  type TraceViewSpan,
  type TranscriptListGroup,
} from "@/components/traces/trace-view/store/base";
import { computePathInfoMap, transformSpansToTree } from "@/components/traces/trace-view/store/utils";
import {
  AgentGroupHeader,
  GroupChildWrapper,
  InputItem,
  SpanItem,
} from "@/components/traces/trace-view/transcript/item";
import { SpanCard } from "@/components/traces/trace-view/tree/span-card";
import { Skeleton } from "@/components/ui/skeleton";
import { SpanType, type TraceRow } from "@/lib/traces/types";

import CopyFlag from "./copy-flag";
import RunComment from "./run-comment";
import { traceAnchorId } from "./session-outline/utils";
import { useDebuggerSessionViewStore } from "./store";

// Paste-to-agent prompt for "cache and rerun from here": the SDK resolves
// LMNR_DEBUG_CACHE_UNTIL from a span id (see lmnr-ts debug/config.ts
// parseCacheUntil) — no need to compute an occurrence count here.
const rerunPrompt = (traceId: string, spanId: string, sessionId?: string) =>
  [
    "Rerun the agent with these env vars:",
    "LMNR_DEBUG=true",
    ...(sessionId ? [`LMNR_DEBUG_SESSION_ID=${sessionId}`] : []),
    `LMNR_DEBUG_REPLAY_TRACE_ID=${traceId}`,
    `LMNR_DEBUG_CACHE_UNTIL=${spanId}`,
  ].join("\n");

// LLM spans get the "cache and rerun" prompt flag; every other span type gets
// the plain Copy-span-ID flag.
const spanFlagProps = (span: TraceViewListSpan, traceId: string, sessionId?: string) =>
  span.spanType === SpanType.LLM
    ? {
        label: "Copy prompt",
        toastTitle: "Copied rerun prompt",
        description: "Cache and rerun from here",
        value: rerunPrompt(traceId, span.spanId, sessionId),
      }
    : { label: "Copy span ID", toastTitle: "Copied span ID", value: span.spanId };

// Transcript rows local to one trace (the only virtualized content).
type TranscriptRow =
  | { type: "user-input" }
  | { type: "span"; span: TraceViewListSpan }
  | { type: "group-header"; group: TranscriptListGroup; collapsed: boolean }
  | { type: "group-span"; span: TraceViewListSpan; isLast: boolean }
  | { type: "tree-span"; span: TraceViewSpan; depth: number; branchMask: boolean[]; hasChildren: boolean };

const buildTreeRows = (spans: TraceViewSpan[]): TranscriptRow[] => {
  const rows: TranscriptRow[] = [{ type: "user-input" }];
  const pathInfoMap = computePathInfoMap(spans);
  for (const ts of transformSpansToTree(spans, pathInfoMap)) {
    rows.push({
      type: "tree-span",
      span: ts.span,
      depth: ts.depth,
      branchMask: ts.branchMask,
      hasChildren: ts.hasChildren,
    });
  }
  return rows;
};

const buildTranscriptRows = (
  spans: TraceViewSpan[],
  traceId: string,
  transcriptExpandedGroups: Set<string>
): TranscriptRow[] => {
  const rows: TranscriptRow[] = [{ type: "user-input" }];
  const entries = computeTranscriptEntries(spans);
  for (const entry of entries) {
    if (entry.type === "span") {
      rows.push({ type: "span", span: entry.span });
    } else if (entry.type === "group") {
      const collapsed = !transcriptExpandedGroups.has(`${traceId}::${entry.groupId}`);
      rows.push({ type: "group-header", group: entry, collapsed });
      if (!collapsed) {
        const children = entries.filter((e) => e.type === "group-span" && e.groupId === entry.groupId);
        children.forEach((child, i) => {
          if (child.type === "group-span") {
            rows.push({ type: "group-span", span: child.span, isLast: i === children.length - 1 });
          }
        });
      }
    }
  }
  return rows;
};

export interface TraceSegmentProps {
  trace: TraceRow;
  traceIndex: number;
  totalTraces: number;
  scrollEl: HTMLElement | null;
  sessionId?: string;
  // Bumped by the list's column ResizeObserver whenever content heights change —
  // each segment re-measures its scrollMargin (offset within the scroll content).
  layoutVersion: number;
  // Report this segment's currently-visible span ids for batched preview fetching.
  reportVisibleSpans: (traceId: string, visible: string[], inputs: string[]) => void;
  previews: Record<string, string | null>;
  userInputs: Record<string, string | null>;
  agentNames: Record<string, string | null>;
  traceIO?: TraceIOEntry | null;
}

/**
 * One trace's article section, in normal document flow:
 *   note (always mounted) → sticky header → virtualized transcript viewport.
 *
 * The transcript uses a PER-TRACE virtualizer bound to the shared page scroll
 * element via `scrollMargin` (the documented multiple-virtualizers-per-scroll-
 * element pattern). The header is plain CSS `sticky top-0` INSIDE this segment
 * container, so the browser pins it while the segment is in view and pushes it
 * out at the segment's bottom edge — it can never cover content below the
 * trace's last span.
 */
export default function TraceSegment({
  trace,
  traceIndex,
  totalTraces,
  scrollEl,
  sessionId,
  layoutVersion,
  reportVisibleSpans,
  previews,
  userInputs,
  agentNames,
  traceIO,
}: TraceSegmentProps) {
  const traceId = trace.id;

  // Narrow per-trace store selections: streamed spans re-render only this segment.
  const { spans, loading, error, expanded, selectedSpan } = useSessionViewBaseStore(
    (s) => ({
      spans: s.traceSpans[traceId],
      loading: s.traceSpansLoading[traceId],
      error: s.traceSpansError[traceId],
      expanded: s.expandedTraceIds.has(traceId),
      selectedSpan: s.selectedSpan,
    }),
    shallow
  );
  const transcriptExpandedGroups = useSessionViewBaseStore((s) => s.transcriptExpandedGroups);
  const toggleTraceExpanded = useSessionViewBaseStore((s) => s.toggleTraceExpanded);
  const toggleTranscriptGroup = useSessionViewBaseStore((s) => s.toggleTranscriptGroup);
  const setSelectedSpan = useSessionViewBaseStore((s) => s.setSelectedSpan);
  const mode = useSessionViewBaseStore((s) => s.traceViewModes[traceId] ?? "transcript");
  const showTreeContent = useSessionViewBaseStore((s) => s.traceShowTreeContent[traceId] ?? true);
  const toggleSpanCollapse = useSessionViewBaseStore((s) => s.toggleSpanCollapse);
  const scrollToTraceId = useSessionViewBaseStore((s) => s.scrollToTraceId);
  const consumeScrollToTrace = useSessionViewBaseStore((s) => s.consumeScrollToTrace);

  const note = useDebuggerSessionViewStore((s) => s.noteForTrace(traceId));
  // True while hydrateTraceRow's one-shot fetch is in flight for this run — keeps
  // a placeholder empty `[]` slot on the skeleton instead of "No spans found".
  const hydrating = useDebuggerSessionViewStore((s) => !!s.traceHydrating[traceId]);

  const rows = useMemo<TranscriptRow[]>(() => {
    if (!expanded || !spans || spans.length === 0) return [];
    return mode === "tree" ? buildTreeRows(spans) : buildTranscriptRows(spans, traceId, transcriptExpandedGroups);
  }, [expanded, spans, traceId, transcriptExpandedGroups, mode]);

  // --- Per-trace virtualizer, offset into the shared scroll element. ---
  const viewportRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  // R1: when THIS trace was just collapsed, bring its header into view — only if
  // out of view (mirrors the regular view's scrollToIndex align:"auto"). The
  // debugger has no flat-row virtualizer to scrollToIndex against; the header is
  // plain DOM, so we bounds-check it against the page scroll container and scroll
  // only when it's outside the viewport, then consume the one-shot request. Keyed
  // on `expanded` too so it runs AFTER the collapse rebuilds this segment's height.
  useEffect(() => {
    if (scrollToTraceId !== traceId) return;
    const header = headerRef.current;
    if (!header || !scrollEl) {
      consumeScrollToTrace();
      return;
    }
    const headerRect = header.getBoundingClientRect();
    const scRect = scrollEl.getBoundingClientRect();
    // Out of view = header top above the container top, or below its bottom.
    if (headerRect.top < scRect.top || headerRect.top > scRect.bottom) {
      const target = scrollEl.scrollTop + (headerRect.top - scRect.top);
      scrollEl.scrollTo({ top: Math.max(0, target), behavior: "auto" });
    }
    consumeScrollToTrace();
  }, [scrollToTraceId, traceId, expanded, scrollEl, consumeScrollToTrace]);

  // Measure this viewport's offset within the scroll content (rect math instead
  // of offsetTop — robust to positioned ancestors). Re-measured whenever the
  // column's height changes (layoutVersion) since anything above us moving
  // shifts the offset. The ±1px guard keeps re-measure→re-render convergent.
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el || !scrollEl) return;
    const next = Math.round(el.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop);
    setScrollMargin((prev) => (Math.abs(prev - next) <= 1 ? prev : next));
  }, [scrollEl, layoutVersion, expanded, rows.length]);

  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const getItemKey = useCallback((index: number) => {
    const row = rowsRef.current[index];
    if (!row) return index;
    switch (row.type) {
      case "user-input":
        return "ui";
      case "span":
        return `sp::${row.span.spanId}`;
      case "group-header":
        return `gh::${row.group.groupId}`;
      case "group-span":
        return `gs::${row.span.spanId}`;
      case "tree-span":
        return `ts::${row.span.spanId}`;
    }
  }, []);

  const estimateSize = useCallback(
    (index: number) => {
      const row = rowsRef.current[index];
      if (!row) return 70;
      if (row.type === "group-header") return 36;
      // Content-visible trees show an LLM preview (~taller) — estimate higher so
      // initial paint re-anchors less; collapsed-content rows stay 36.
      if (row.type === "tree-span") return showTreeContent ? 56 : 36;
      return 70;
    },
    [showTreeContent]
  );

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollEl,
    estimateSize,
    overscan: 10,
    scrollMargin,
    getItemKey,
  });

  const items = virtualizer.getVirtualItems();

  // --- Report visible span ids for preview batching (same derivation the flat
  // list used, now per segment). Signature-guarded against effect loops. ---
  const visibleSignature = items.map((i) => i.index).join(",");
  useEffect(() => {
    const visible: string[] = [];
    const inputs: string[] = [];
    const push = (arr: string[], id: string) => {
      if (!arr.includes(id)) arr.push(id);
    };
    for (const vi of items) {
      const row = rows[vi.index];
      if (!row) continue;
      if (row.type === "span" || row.type === "group-span" || row.type === "tree-span") {
        push(visible, row.span.spanId);
      } else if (row.type === "group-header") {
        if (row.group.firstLlmSpanId) {
          push(visible, row.group.firstLlmSpanId);
          push(inputs, row.group.firstLlmSpanId);
        }
        if (row.collapsed && row.group.lastLlmSpanId) push(visible, row.group.lastLlmSpanId);
      }
    }
    reportVisibleSpans(traceId, visible, inputs);
    // visibleSignature stands in for `items` (new array identity every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleSignature, rows, traceId, reportVisibleSpans]);

  // Scroll selected span (in this trace) to center, once per selection.
  const lastScrolledSpanIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selectedSpan || selectedSpan.traceId !== traceId) return;
    if (lastScrolledSpanIdRef.current === selectedSpan.spanId) return;
    const idx = rows.findIndex(
      (r) =>
        (r.type === "span" || r.type === "group-span" || r.type === "tree-span") &&
        r.span.spanId === selectedSpan.spanId
    );
    if (idx === -1) return;
    lastScrolledSpanIdRef.current = selectedSpan.spanId;
    const rafId = requestAnimationFrame(() => virtualizer.scrollToIndex(idx, { align: "center" }));
    return () => cancelAnimationFrame(rafId);
  }, [selectedSpan, rows, traceId, virtualizer]);

  return (
    <div id={traceAnchorId(traceId)} className="relative">
      {note && (
        <div className="px-1 pb-5 pt-1">
          <RunComment traceId={traceId} />
        </div>
      )}

      {/* Always sticky (collapsed AND expanded): CSS bounds it to THIS container,
          so it pins at the top and is pushed out by the segment's bottom edge.
          When collapsed the body below it is the (non-sticky) TraceCollapsedBody
          sibling, so the stuck header pins just the ~40px bar over its own body —
          the same row-split the regular view does, without a flat-row builder. */}
      <div ref={headerRef} data-vrow className="sticky top-0 z-20 bg-background">
        <CopyFlag label="Copy trace ID" toastTitle="Copied trace ID" value={traceId}>
          <TraceItem
            trace={trace}
            expanded={expanded}
            traceIndex={traceIndex}
            totalTraces={totalTraces}
            onToggle={() => toggleTraceExpanded(traceId)}
            analyticsFeature="debugger_sessions"
          />
        </CopyFlag>
      </div>

      {/* Collapsed body (input + last-span preview) in normal flow under the
          sticky header — stitches the card across the two elements (TraceItem
          provides rounded-t + side/top borders; TraceCollapsedBody the side/
          bottom borders + rounded-b). Not virtualized: a single short block. */}
      {!expanded && <TraceCollapsedBody trace={trace} traceIO={traceIO} />}

      {expanded && error && <div className="py-4 px-2 text-sm text-destructive">{error}</div>}
      {expanded && !error && (!spans || (spans.length === 0 && (loading || hydrating))) && (
        <div className="flex flex-col gap-2 py-2 px-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      )}
      {expanded && !error && spans && spans.length === 0 && !loading && !hydrating && (
        <div className="py-4 px-2 text-sm text-muted-foreground">No spans found for this trace.</div>
      )}

      {expanded && rows.length > 0 && (
        <div ref={viewportRef} className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
          {items.map((virtualRow) => {
            const row = rows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start - virtualizer.options.scrollMargin}px)`,
                }}
              >
                {row.type === "user-input" ? (
                  <InputItem
                    text={traceIO?.inputPreview ?? null}
                    isLoading={traceIO === undefined}
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
                    onToggle={() => toggleTranscriptGroup(traceId, row.group.groupId)}
                  />
                ) : row.type === "group-span" ? (
                  <GroupChildWrapper isLast={row.isLast} className="mx-0">
                    <CopyFlag {...spanFlagProps(row.span, traceId, sessionId)}>
                      <SpanItem
                        span={row.span}
                        output={previews[row.span.spanId]}
                        onSpanSelect={(s) => setSelectedSpan({ traceId, spanId: s.spanId })}
                        isSelected={!!selectedSpan && selectedSpan.spanId === row.span.spanId}
                        inGroup
                      />
                    </CopyFlag>
                  </GroupChildWrapper>
                ) : row.type === "tree-span" ? (
                  <SpanCard
                    span={row.span}
                    branchMask={row.branchMask}
                    depth={row.depth}
                    hasChildren={row.hasChildren}
                    output={previews[row.span.spanId]}
                    showTreeContent={showTreeContent}
                    isSelected={!!selectedSpan && selectedSpan.spanId === row.span.spanId}
                    onSpanSelect={(s) => s && setSelectedSpan({ traceId, spanId: s.spanId })}
                    onToggleCollapse={(spanId) => toggleSpanCollapse(traceId, spanId)}
                  />
                ) : (
                  <CopyFlag {...spanFlagProps(row.span, traceId, sessionId)}>
                    <SpanItem
                      span={row.span}
                      output={previews[row.span.spanId]}
                      onSpanSelect={(s) => setSelectedSpan({ traceId, spanId: s.spanId })}
                      isSelected={!!selectedSpan && selectedSpan.spanId === row.span.spanId}
                    />
                  </CopyFlag>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
