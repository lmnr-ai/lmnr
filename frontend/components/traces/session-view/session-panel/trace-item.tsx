"use client";

import { ChevronDown, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { shallow } from "zustand/shallow";

import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";
import { SpanStatsShield } from "@/components/traces/trace-view/span-stats-shield";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import { useSessionViewBaseStore } from "../store";
import TraceControlBar from "./trace-control-bar";

interface TraceItemProps {
  trace: TraceRow;
  expanded: boolean;
  traceIndex: number;
  totalTraces: number;
  onToggle: () => void;
  className?: string;
  /** Which surface this card belongs to — drives the control bar's analytics
   *  attribution. The debugger passes "debugger_sessions"; defaults to "sessions". */
  analyticsFeature?: "sessions" | "debugger_sessions";
}

export default function TraceItem({
  trace,
  expanded,
  traceIndex,
  totalTraces,
  onToggle,
  className,
  analyticsFeature,
}: TraceItemProps) {
  const params = useParams<{ projectId: string }>();
  const projectId = params.projectId;
  const { toast } = useToast();

  // Only the data the header chrome needs: `spans` gates the pending-expand
  // spinner; `spansError` lets a failed lazy-load still flip out of pending.
  // The collapsed body (input + last-span preview) is its own row now.
  const { spans, spansError, fetchTraceSpans } = useSessionViewBaseStore(
    (s) => ({
      spans: s.traceSpans[trace.id],
      spansError: s.traceSpansError[trace.id],
      fetchTraceSpans: s.fetchTraceSpans,
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

  const handleToggle = useCallback(() => {
    track("sessions", expanded ? "trace_card_collapsed" : "trace_card_expanded", { traceId: trace.id });
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
    fetchTraceSpans(trace);
  }, [expanded, spans, onToggle, fetchTraceSpans, trace]);

  const handleCopyTraceId = useCallback(async () => {
    await navigator.clipboard.writeText(trace.id);
    toast({ title: "Copied trace ID", duration: 1000 });
  }, [trace.id, toast]);

  // "Open trace view": open the full-screen trace page in a new tab (both surfaces).
  const handleOpenInTraceView = useCallback(() => {
    window.open(`/project/${projectId}/traces/${trace.id}`, "_blank", "noopener,noreferrer");
  }, [projectId, trace.id]);

  const relativeTime = useMemo(() => {
    try {
      return formatShortRelativeTime(new Date(trace.endTime));
    } catch {
      return "";
    }
  }, [trace.endTime]);

  return (
    <div
      className={cn(
        "transition-[padding] duration-200 ease-out bg-gradient-to-b from-transparent to-background to-4% group",
        className
      )}
    >
      {/* When collapsed, the card is only the header chrome: top-rounded, NO
          bottom border/rounding — the trace-collapsed-body row beneath provides
          the side+bottom borders and bottom rounding, stitching one card across
          two virtual rows. The header button's own `border-b` (collapsed) is the
          single divider. When expanded the body rows below are borderless spans. */}
      <div
        className={cn(
          "overflow-hidden w-full border-x border-t border-[rgba(232,232,232,0.1)]",
          expanded ? "bg-muted rounded-lg border-b" : "bg-muted/75 rounded-t-lg"
        )}
      >
        <div onClick={handleToggle} className={cn("w-full flex flex-col transition-all ease-in-out")}>
          <button
            type="button"
            className={cn(
              "w-full flex items-center justify-between text-left cursor-pointer transition-all ease-in-out h-[40px]",
              expanded
                ? "pl-1.5 pr-3 hover:bg-muted/80"
                : "pl-1.5 pr-3 bg-[rgba(232,232,232,0.02)] border-b border-[rgba(232,232,232,0.1)] hover:bg-[rgba(232,232,232,0.04)]"
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
                    Open trace view
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
              <span
                className={cn(
                  "flex items-center justify-center rounded-full pl-1 pr-1 py-0.5 text-xs font-medium leading-[17px] text-secondary-foreground whitespace-nowrap",
                  "group-hover:border border-[rgba(232,232,232,0.1)] group-hover:bg-[rgba(232,232,232,0.05)] group-hover:gap-1 group-hover:pl-2.5",
                  // Mirror the hover reveal when the adjacent collapsed-body virtual
                  // row is hovered (R3 split the body into its own row).
                  "sibling-body-hover:border sibling-body-hover:bg-[rgba(232,232,232,0.05)] sibling-body-hover:gap-1 sibling-body-hover:pl-2.5"
                )}
              >
                <span className="opacity-0 group-hover:opacity-100 sibling-body-hover:opacity-100 overflow-hidden group-hover:w-[50px] sibling-body-hover:w-[50px] w-0 transition-all duration-200">
                  {expanded ? "Collapse" : "Expand"}
                </span>
                <ChevronDown
                  size={16}
                  className={cn("text-secondary-foreground transition-transform", !expanded && "-rotate-90")}
                />
              </span>
            </div>
          </button>
          {expanded && (
            <div className="bg-secondary/75 px-3 py-2 border-t">
              <TraceControlBar trace={trace} analyticsFeature={analyticsFeature} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
