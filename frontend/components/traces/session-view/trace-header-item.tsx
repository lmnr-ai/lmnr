"use client";

import { ChevronDown, ChevronsUpDown } from "lucide-react";
import { useEffect, useMemo } from "react";
import { shallow } from "zustand/shallow";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import ListItem from "@/components/traces/trace-view/list/list-item";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { computePathInfoMap } from "@/components/traces/trace-view/store/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewStore } from "./store";
import { spanToListSpan } from "./utils";

interface TraceHeaderItemProps {
  trace: TraceRow;
  expanded: boolean;
  /** 1-based index within the session, for "2/4" display. */
  traceIndex: number;
  totalTraces: number;
  onToggle: () => void;
  /** Flat spanId → preview text map from useSessionSpanPreviews. */
  previews: Record<string, any>;
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
export default function TraceHeaderItem({
  trace,
  expanded,
  traceIndex,
  totalTraces,
  onToggle,
  previews,
}: TraceHeaderItemProps) {
  const { spans, isSpansLoading, spansError, selectedSpan, ensureTraceSpans, setSelectedSpan } = useSessionViewStore(
    (s) => ({
      spans: s.traceSpans[trace.id],
      isSpansLoading: !!s.traceSpansLoading[trace.id],
      spansError: s.traceSpansError[trace.id],
      selectedSpan: s.selectedSpan,
      ensureTraceSpans: s.ensureTraceSpans,
      setSelectedSpan: s.setSelectedSpan,
    }),
    shallow
  );

  // Trigger span fetch on mount (idempotent per trace). The virtualizer only
  // mounts header items for visible traces, so this naturally avoids fetching
  // spans for off-screen traces.
  useEffect(() => {
    ensureTraceSpans(trace);
  }, [trace, ensureTraceSpans]);

  // TODO(session-view): properly identify which spans represent the trace's
  // "input" and "output". Today we take the first and last non-DEFAULT spans.
  // See `sessions-table/session-trace-card.tsx` for how the table surfaces
  // trace input/output — it uses a server-side IO endpoint, but here we need
  // actual span rows (so we can reuse ListItem for selection).
  const { firstSpan, lastSpan, middleSpanCount } = useMemo(() => {
    if (!spans || spans.length === 0) {
      return { firstSpan: null, lastSpan: null, middleSpanCount: 0 };
    }
    const displaySpans = spans.filter((s) => s.spanType !== "DEFAULT");
    if (displaySpans.length === 0) return { firstSpan: null, lastSpan: null, middleSpanCount: 0 };
    const pathInfoMap = computePathInfoMap(spans);
    const first = spanToListSpan(displaySpans[0], pathInfoMap.get(displaySpans[0].spanId) ?? null);
    const last =
      displaySpans.length > 1
        ? spanToListSpan(
            displaySpans[displaySpans.length - 1],
            pathInfoMap.get(displaySpans[displaySpans.length - 1].spanId) ?? null
          )
        : null;
    const middle = Math.max(0, displaySpans.length - (last ? 2 : 1));
    return { firstSpan: first, lastSpan: last, middleSpanCount: middle };
  }, [spans]);

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
          onClick={onToggle}
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
            {expanded && <ChevronDown size={16} className="text-secondary-foreground" />}
          </div>
        </button>

        {/* Collapsed-state body: first span + N-spans divider + last span */}
        {!expanded && (
          <div className="flex flex-col">
            {spansError ? (
              <div className="px-3 py-2 text-xs text-destructive">{spansError}</div>
            ) : isSpansLoading && !spans ? (
              <div className="flex flex-col gap-2 px-3 py-2">
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-5 w-3/4" />
              </div>
            ) : firstSpan ? (
              <>
                <div className="border-b border-[rgba(232,232,232,0.1)]">
                  <ListItem
                    span={firstSpan}
                    output={previews[firstSpan.spanId]}
                    onSpanSelect={(s) => handleSpanSelect(s.spanId)}
                    isSelected={
                      !!selectedSpan && selectedSpan.traceId === trace.id && selectedSpan.spanId === firstSpan.spanId
                    }
                  />
                </div>
                {lastSpan && middleSpanCount > 0 && <MiddleSpansDivider count={middleSpanCount} onClick={onToggle} />}
                {lastSpan && (
                  <ListItem
                    span={lastSpan}
                    output={previews[lastSpan.spanId]}
                    onSpanSelect={(s) => handleSpanSelect(s.spanId)}
                    isSelected={
                      !!selectedSpan && selectedSpan.traceId === trace.id && selectedSpan.spanId === lastSpan.spanId
                    }
                  />
                )}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function MiddleSpansDivider({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center justify-between py-1.5 pl-11 pr-3 bg-[rgba(232,232,232,0.02)] border-b border-[rgba(232,232,232,0.1)] hover:bg-[rgba(232,232,232,0.04)] transition-colors cursor-pointer"
    >
      <span className="text-[13px] leading-[17px] text-secondary-foreground">{count} spans</span>
      <ChevronsUpDown size={16} className="text-muted-foreground" />
    </button>
  );
}
