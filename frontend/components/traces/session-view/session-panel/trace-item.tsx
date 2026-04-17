"use client";

import { ChevronDown, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { type TraceIOEntry } from "@/components/traces/sessions-table/use-batched-trace-io";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import { type TraceViewSpan } from "@/components/traces/trace-view/store/base";
import { InputItem, SpanItem } from "@/components/traces/trace-view/transcript/item";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewStore } from "../store";
import { spanToListSpan } from "../utils";

interface TraceItemProps {
  trace: TraceRow;
  expanded: boolean;
  traceIndex: number;
  totalTraces: number;
  onToggle: () => void;
  traceIO?: TraceIOEntry | null;
}

export default function TraceItem({ trace, expanded, traceIndex, totalTraces, onToggle, traceIO }: TraceItemProps) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();

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

  const lastFullSpan = useMemo(() => {
    if (!traceIO?.outputSpan) return null;
    return traceIO.outputSpan as unknown as TraceViewSpan;
  }, [traceIO?.outputSpan]);

  const lastSpan = useMemo(() => {
    if (!lastFullSpan) return null;
    return spanToListSpan(lastFullSpan);
  }, [lastFullSpan]);

  const handleToggle = useCallback(() => {
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
  }, [expanded, spans, onToggle, ensureTraceSpans, trace]);

  const handleCopyTraceId = useCallback(async () => {
    await navigator.clipboard.writeText(trace.id);
    toast({ title: "Copied trace ID", duration: 1000 });
  }, [trace.id, toast]);

  const handleOpenInTraceView = useCallback(() => {
    window.open(`/project/${projectId}/traces?traceId=${trace.id}`, "_blank");
  }, [projectId, trace.id]);

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
          className={cn(
            "w-full flex items-center justify-between text-left transition-colors cursor-pointer",
            expanded
              ? "pl-1.5 pr-3 pt-[9px] pb-2 hover:bg-muted/80"
              : "pl-1.5 pr-3 pt-2 pb-1 bg-[rgba(232,232,232,0.02)] border-b border-[rgba(232,232,232,0.1)] hover:bg-[rgba(232,232,232,0.04)]"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center justify-center rounded-full border border-[rgba(232,232,232,0.1)] bg-[rgba(232,232,232,0.05)] px-2 py-0.5 text-[10px] font-medium leading-[17px] text-secondary-foreground whitespace-nowrap">
              {traceIndex}/{totalTraces}
            </span>
            <span className="text-[13px] font-medium leading-[17px] text-primary-foreground whitespace-nowrap">
              Trace
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                  className="inline-flex items-center justify-center rounded hover:bg-secondary cursor-pointer"
                >
                  <ChevronDown className="size-3.5 text-secondary-foreground" />
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={handleCopyTraceId}>
                  <Copy size={14} />
                  Copy trace ID
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handleOpenInTraceView}>
                  <ExternalLink size={14} />
                  Open in trace view
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
                  <InputItem text={traceIO?.inputPreview ?? null} isLoading={!traceIO} />
                </div>
                {lastSpan ? (
                  <SpanItem
                    span={lastSpan}
                    fullSpan={lastFullSpan ?? undefined}
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
