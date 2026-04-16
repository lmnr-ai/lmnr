"use client";

import { ChevronDown, ChevronsUpDown, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { type TraceIOEntry } from "@/components/traces/sessions-table/use-batched-trace-io";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewStore } from "../store";
import { spanToListSpan } from "../utils";
import { SessionInputItem, SessionSpanItem } from "./session-transcript-items";

interface TraceItemProps {
  trace: TraceRow;
  expanded: boolean;
  traceIndex: number;
  totalTraces: number;
  onToggle: () => void;
  traceIO?: TraceIOEntry | null;
}

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

  const pendingExpandRef = useRef(false);
  const [isPendingExpand, setIsPendingExpand] = useState(false);

  useEffect(() => {
    if (!pendingExpandRef.current) return;
    if (spans || spansError) {
      pendingExpandRef.current = false;
      queueMicrotask(() => {
        setIsPendingExpand(false);
        onToggle();
      });
    }
  }, [spans, spansError, onToggle]);

  const lastSpan = useMemo(() => {
    if (!traceIO?.outputSpan) return null;
    return spanToListSpan(traceIO.outputSpan as unknown as TraceViewSpan, null);
  }, [traceIO?.outputSpan]);

  // Subtract 4: two end rows (input pill + output LLM) plus the ~2 spans
  // they each represent internally (root/wrapper spans that don't carry
  // their own user-visible content).
  const middleSpanCount = useMemo(() => {
    if (traceIO?.spanCount == null) return 0;
    return Math.max(0, traceIO.spanCount - 4);
  }, [traceIO?.spanCount]);

  // Trivial trace: nothing left in the middle → collapsed card already shows
  // everything. Hide the expand affordance and ignore clicks. When
  // `spanCount` is still loading we optimistically assume expandable.
  const isExpandable = traceIO?.spanCount == null || traceIO.spanCount > 4;

  const handleToggle = useCallback(() => {
    if (!isExpandable) return;
    if (expanded) {
      onToggle();
      return;
    }
    if (spans) {
      onToggle();
      return;
    }
    pendingExpandRef.current = true;
    setIsPendingExpand(true);
    ensureTraceSpans(trace);
  }, [isExpandable, expanded, spans, onToggle, ensureTraceSpans, trace]);

  const relativeTime = useMemo(() => {
    try {
      return formatShortRelativeTime(new Date(trace.endTime));
    } catch {
      return "";
    }
  }, [trace.endTime]);

  const handleSpanSelect = (spanId: string) => setSelectedSpan({ traceId: trace.id, spanId });

  return (
    <div
      className={cn(
        "transition-[padding] duration-200 ease-out bg-gradient-to-b from-transparent to-background to-4%",
        expanded ? "p-0" : "p-1"
      )}
    >
      <div
        className={cn(
          "overflow-hidden w-full",
          expanded ? "bg-muted border-t" : "bg-muted/75 border border-[rgba(232,232,232,0.1)] rounded-lg"
        )}
      >
        <button
          type="button"
          onClick={handleToggle}
          disabled={!isExpandable}
          className={cn(
            "w-full flex items-center justify-between text-left transition-colors",
            isExpandable ? "cursor-pointer" : "cursor-default",
            expanded
              ? "pl-1.5 pr-3 pt-[9px] pb-2 hover:bg-muted/80"
              : cn(
                  "pl-1.5 pr-3 pt-2 pb-1 bg-[rgba(232,232,232,0.02)] border-b border-[rgba(232,232,232,0.1)]",
                  isExpandable && "hover:bg-[rgba(232,232,232,0.04)]"
                )
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
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
              inputTokens={trace.inputTokens}
              outputTokens={trace.outputTokens}
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

        {!expanded && (
          <div className="flex flex-col">
            {spansError ? (
              <div className="px-3 py-2 text-xs text-destructive">{spansError}</div>
            ) : (
              <>
                <div className="border-b border-[rgba(232,232,232,0.1)]">
                  <SessionInputItem text={traceIO?.inputPreview ?? null} isLoading={!traceIO} />
                </div>
                {lastSpan && middleSpanCount > 0 && (
                  <MiddleSpansDivider count={middleSpanCount} isLoading={isPendingExpand} onClick={handleToggle} />
                )}
                {lastSpan ? (
                  <SessionSpanItem
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
