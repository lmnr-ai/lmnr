"use client";

import { ChevronDown, ChevronsUpDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { type TraceIOEntry } from "@/components/traces/sessions-table/use-batched-trace-io";
import ListItem from "@/components/traces/trace-view/list/list-item";
import { UserInputItem } from "@/components/traces/trace-view/list/user-input-item";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewStore } from "./store";
import { spanToListSpan } from "./utils";

interface TraceItemProps {
  trace: TraceRow;
  expanded: boolean;
  /** 1-based index within the session, for "2/4" display. */
  traceIndex: number;
  totalTraces: number;
  onToggle: () => void;
  /** Main-agent input/output for this trace from the `/traces/io` endpoint.
   *  Undefined while batched fetch is pending; null if the backend returned
   *  no result for this trace. */
  traceIO?: TraceIOEntry | null;
}

/**
 * Trace row in the session panel.
 *
 * Visuals (see figma 3711:5386 collapsed, 3711:5575 expanded):
 * - Collapsed: padded outer (p-1), rounded-lg bordered card holding header +
 *   first-span preview + "N spans" divider + last-span preview.
 * - Expanded: zero outer padding, flat `bg-muted` header strip with a
 *   chevron-down. Spans are rendered by the flat-list virtualizer below.
 * - The outer padding animates on transition (spec-driven).
 */
export default function TraceItem({ trace, expanded, traceIndex, totalTraces, onToggle, traceIO }: TraceItemProps) {
  const { spans, spansError, selectedSpan, ensureTraceSpans, setSelectedSpan } = useSessionViewStore(
    (s) => ({
      spans: s.traceSpans[trace.id],
      spansError: s.traceSpansError[trace.id],
      selectedSpan: s.selectedSpan,
      ensureTraceSpans: s.ensureTraceSpans,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );

  // Two-phase expand: when the user clicks to expand, we start loading spans
  // but keep the collapsed card visible (with a "Loading..." divider) until
  // spans arrive. This prevents the layout shift that would occur if we
  // immediately switched to the expanded header + skeleton rows.
  //
  // `pendingExpandRef` tracks intent without triggering extra renders.
  // `isPendingExpand` state drives the UI (spinner, "Loading..." text).
  const pendingExpandRef = useRef(false);
  const [isPendingExpand, setIsPendingExpand] = useState(false);

  useEffect(() => {
    if (!pendingExpandRef.current) return;
    if (spans || spansError) {
      pendingExpandRef.current = false;
      // Defer the state updates to avoid synchronous setState within the
      // effect body, which can trigger cascading renders.
      queueMicrotask(() => {
        setIsPendingExpand(false);
        onToggle();
      });
    }
  }, [spans, spansError, onToggle]);

  const handleToggle = useCallback(() => {
    if (expanded) {
      onToggle();
      return;
    }
    // Spans already loaded — expand immediately
    if (spans) {
      onToggle();
      return;
    }
    // Start loading; expand deferred until spans arrive
    pendingExpandRef.current = true;
    setIsPendingExpand(true);
    ensureTraceSpans(trace);
  }, [expanded, spans, onToggle, ensureTraceSpans, trace]);

  // Input/output derivation now comes from the `/traces/io` endpoint. The
  // sessions-table logic (main agent path → last LLM span = output) is reused
  // unchanged server-side; here we just consume the `outputSpan` payload.
  //
  // Shape note: `Span` (endpoint) is a superset of what `TraceViewListSpan`
  // needs, minus `inputSnippet` / `outputSnippet` / `attributesSnippet`. That's
  // fine — ListItem uses the `output` prop for preview text (which we fill
  // from `traceIO.outputPreview`), so the snippet fields would be unused here
  // anyway. `pathInfo` is null: without the full span list at collapse time,
  // we skip the breadcrumb — acceptable for the figma layout.
  const lastSpan = useMemo(() => {
    if (!traceIO?.outputSpan) return null;
    return spanToListSpan(traceIO.outputSpan as unknown as TraceViewSpan, null);
  }, [traceIO?.outputSpan]);

  // Middle divider count: total spans − 2 (one input pill, one output row).
  // `spanCount` comes from `/traces/span-count` via useBatchedTraceIO
  // (`isIncludeSpanCounts: true`). Undefined until the batch resolves;
  // divider hides (count=0) in that window.
  const middleSpanCount = useMemo(() => {
    if (traceIO?.spanCount == null) return 0;
    return Math.max(0, traceIO.spanCount - 2);
  }, [traceIO?.spanCount]);

  const relativeTime = useMemo(() => {
    try {
      return formatShortRelativeTime(new Date(trace.endTime));
    } catch {
      return "";
    }
  }, [trace.endTime]);

  const handleSpanSelect = (spanId: string) => setSelectedSpan({ traceId: trace.id, spanId });

  return (
    <div className={cn("transition-[padding] duration-200 ease-out", expanded ? "p-0" : "p-1")}>
      <div
        className={cn(
          "overflow-hidden w-full",
          expanded ? "bg-muted border-t" : "bg-[rgba(34,34,38,0.75)] border border-[rgba(232,232,232,0.1)] rounded-lg"
        )}
      >
        {/* Header row (always visible, clickable) */}
        <button
          type="button"
          onClick={handleToggle}
          className={cn(
            "w-full flex items-center justify-between text-left cursor-pointer transition-colors",
            // Expanded header (flat): bg-muted + slightly taller top padding
            expanded
              ? "pl-1.5 pr-3 pt-[9px] pb-2 hover:bg-muted/80"
              : // Collapsed header (inside card): subtle tint + border-b
                "pl-1.5 pr-3 pt-2 pb-1 bg-[rgba(232,232,232,0.02)] border-b border-[rgba(232,232,232,0.1)] hover:bg-[rgba(232,232,232,0.04)]"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            {/* Trace index pill */}
            <span className="inline-flex items-center justify-center rounded-full border border-[rgba(232,232,232,0.1)] bg-[rgba(232,232,232,0.05)] px-2 py-0.5 text-[10px] font-medium leading-[17px] text-secondary-foreground whitespace-nowrap">
              {traceIndex}/{totalTraces}
            </span>
            <span className="text-[13px] font-medium leading-[17px] text-primary-foreground whitespace-nowrap">
              Trace
            </span>
            <SpanStatsShield
              variant="inline"
              startTime={trace.startTime}
              endTime={trace.endTime}
              tokens={trace.totalTokens}
              cost={trace.totalCost}
              cacheReadInputTokens={trace.cacheReadInputTokens}
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[13px] leading-[17px] text-secondary-foreground whitespace-nowrap">
              {relativeTime}
            </span>
            {isPendingExpand && <Loader2 size={16} className="text-secondary-foreground animate-spin" />}
            {expanded && <ChevronDown size={16} className="text-secondary-foreground" />}
          </div>
        </button>

        {/* Collapsed-state body: synthetic user input pill + N-spans divider + output span */}
        {!expanded && (
          <div className="flex flex-col">
            {spansError ? (
              <div className="px-3 py-2 text-xs text-destructive">{spansError}</div>
            ) : (
              <>
                <div className="border-b border-[rgba(232,232,232,0.1)]">
                  <UserInputItem text={traceIO?.inputPreview ?? null} isLoading={!traceIO} />
                </div>
                {lastSpan && middleSpanCount > 0 && (
                  <MiddleSpansDivider count={middleSpanCount} isLoading={isPendingExpand} onClick={handleToggle} />
                )}
                {lastSpan ? (
                  <ListItem
                    span={lastSpan}
                    output={traceIO?.outputPreview}
                    onSpanSelect={(s) => handleSpanSelect(s.spanId)}
                    isSelected={
                      !!selectedSpan && selectedSpan.traceId === trace.id && selectedSpan.spanId === lastSpan.spanId
                    }
                  />
                ) : !traceIO ? (
                  <div className="flex flex-col gap-2 px-3 py-2">
                    <Skeleton className="h-5 w-full" />
                    <Skeleton className="h-5 w-3/4" />
                  </div>
                ) : null}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function MiddleSpansDivider({
  count,
  isLoading,
  onClick,
}: {
  count: number;
  isLoading?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className="flex items-center justify-between py-1.5 pl-11 pr-3 bg-[rgba(232,232,232,0.02)] border-b border-[rgba(232,232,232,0.1)] hover:bg-[rgba(232,232,232,0.04)] transition-colors cursor-pointer disabled:cursor-default"
    >
      <span className="text-[13px] leading-[17px] text-secondary-foreground">
        {isLoading ? "Loading..." : `${count} spans`}
      </span>
      {isLoading ? (
        <Loader2 size={16} className="text-muted-foreground animate-spin" />
      ) : (
        <ChevronsUpDown size={16} className="text-muted-foreground" />
      )}
    </button>
  );
}
