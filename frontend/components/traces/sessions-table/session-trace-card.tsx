"use client";

import { ChevronDown, ChevronUp, CircleDollarSign, Clock3, Coins } from "lucide-react";
import { useState } from "react";
import { shallow } from "zustand/shallow";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter.tsx";
import Markdown from "@/components/traces/trace-view/list/markdown";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { type TraceRow } from "@/lib/traces/types";
import { cn, getDurationString } from "@/lib/utils";

import { useSessionsStoreContext } from "./sessions-store";

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

interface SessionTraceCardProps {
  trace: TraceRow;
  isLast: boolean;
  onClick?: () => void;
}

export default function SessionTraceCard({ trace, isLast, onClick }: SessionTraceCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { traceIO, isLoading } = useSessionsStoreContext(
    (s) => ({
      traceIO: s.traceIO[trace.id],
      isLoading: trace.sessionId ? s.loadingSessionIO.has(trace.sessionId) : false,
    }),
    shallow
  );

  return (
    <div
      className={cn("flex w-full px-6 cursor-pointer pb-2", {
        "pb-6 border-b": isLast,
      })}
    >
      <div
        className={cn(
          "bg-secondary border rounded flex items-start overflow-clip w-full hover:border-muted-foreground/50 transition-all duration-200",
          isExpanded ? "h-[280px]" : "h-[140px]"
        )}
        onClick={onClick}
      >
        {/* Details column */}
        <div className="flex flex-col h-full justify-between px-4 py-3 shrink-0 w-40">
          <div className="flex flex-col gap-1">
            <ClientTimestampFormatter
              className="text-xs text-secondary-foreground leading-4"
              timestamp={trace.startTime}
            />
            <div onClick={(e) => e.stopPropagation()}>
              <CopyTooltip value={trace.id}>
                <span className="text-xs text-primary-foreground leading-4 truncate block" title={trace.id}>
                  {trace.id}
                </span>
              </CopyTooltip>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex gap-1 h-4 items-center">
              <Clock3 size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {getDurationString(trace.startTime, trace.endTime)}
              </span>
            </div>
            <div className="flex gap-1 h-4 items-center">
              <Coins size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {compactNumberFormat.format(trace.totalTokens)}
              </span>
            </div>
            <div className="flex gap-1 h-4 items-center">
              <CircleDollarSign size={12} className="shrink-0 text-muted-foreground" />
              <span className="font-mono text-xs text-muted-foreground whitespace-nowrap leading-4">
                {(trace.totalCost ?? 0).toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Input column */}
        <TraceIOContent
          text={traceIO?.input}
          isLoading={isLoading}
          fallback="No input available"
          isExpanded={isExpanded}
          onExpand={(e) => {
            setIsExpanded((prev) => !prev);
            e.stopPropagation();
          }}
        />

        {/* Output column */}
        <TraceIOContent
          text={traceIO?.output}
          isLoading={isLoading}
          fallback="No output available"
          isExpanded={isExpanded}
          onExpand={(e) => {
            setIsExpanded((prev) => !prev);
            e.stopPropagation();
          }}
        />
      </div>
    </div>
  );
}

function TraceIOContent({
  text,
  isLoading,
  fallback,
  isExpanded,
  onExpand,
}: {
  text: string | null | undefined;
  isLoading: boolean;
  fallback: string;
  isExpanded: boolean;
  onExpand: (e: React.MouseEvent<HTMLButtonElement>) => void;
}) {
  return (
    <div className={cn("bg-muted/40 border-l flex-1 h-full min-w-0 overflow-hidden relative group")}>
      <div
        className={cn(
          "h-full px-3 pt-2 pb-8 overflow-x-hidden break-words",
          isExpanded ? "overflow-y-auto" : "overflow-y-hidden"
        )}
      >
        {isLoading && !text ? (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <Skeleton className="h-3 w-3/5" />
          </div>
        ) : !text ? (
          <p className="text-xs text-muted-foreground leading-4">{fallback}</p>
        ) : (
          <Markdown output={text} className="text-secondary-foreground [&_*]:text-inherit" contentClassName="pb-0" />
        )}
      </div>
      <button
        className="absolute bottom-0 left-0 right-0 h-14 flex items-end justify-center pb-1 bg-gradient-to-t from-secondary/80 to-transparent transition-all duration-200 text-secondary-foreground hover:text-primary-foreground"
        onClick={onExpand}
      >
        <span className="transition-opacity duration-200 opacity-0 group-hover:opacity-100">
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>
    </div>
  );
}
