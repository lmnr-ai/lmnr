"use client";

import { CircleDollarSign, Clock3, Coins } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { shallow } from "zustand/shallow";

import Markdown from "@/components/traces/trace-view/list/markdown";
import CopyTooltip from "@/components/ui/copy-tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast";
import { type TraceRow } from "@/lib/traces/types";
import { cn, formatRelativeTime, getDurationString } from "@/lib/utils";

import { useSessionsStoreContext } from "./sessions-store";

const compactNumberFormat = new Intl.NumberFormat("en-US", {
  notation: "compact",
});

interface SessionTraceCardProps {
  trace: TraceRow;
  isFirst: boolean;
  isLast: boolean;
  onClick?: () => void;
}

export default function SessionTraceCard({ trace, isFirst, isLast, onClick }: SessionTraceCardProps) {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { traceIO, isLoading } = useSessionsStoreContext(
    (s) => ({
      traceIO: s.traceIO[trace.id],
      isLoading: s.loadingTraceIO.has(trace.id),
    }),
    shallow
  );

  const setTraceIO = useSessionsStoreContext((s) => s.setTraceIO);
  const setLoadingTraceIO = useSessionsStoreContext((s) => s.setLoadingTraceIO);

  // TODO: Add caching/virtualization - currently fetches naively per card mount
  // TODO: Consider batching fetches for all visible traces in a session
  useEffect(() => {
    if (traceIO !== undefined || isLoading) return;

    const fetchIO = async () => {
      setLoadingTraceIO(trace.id, true);
      try {
        const params = new URLSearchParams();
        if (trace.startTime) {
          params.set("startDate", new Date(new Date(trace.startTime).getTime() - 1000).toISOString());
        }
        if (trace.endTime) {
          params.set("endDate", new Date(new Date(trace.endTime).getTime() + 1000).toISOString());
        }
        const res = await fetch(`/api/projects/${projectId}/traces/${trace.id}/main-agent-output?${params.toString()}`);
        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d: { error?: string }) => d?.error)
            .catch(() => null);
          toast({ variant: "destructive", title: errMessage ?? "Failed to fetch trace IO" });
          return;
        }
        const data = (await res.json()) as { input: string | null; output: string | null };
        setTraceIO(trace.id, data);
      } catch {
        toast({ variant: "destructive", title: "Failed to fetch trace IO" });
      } finally {
        setLoadingTraceIO(trace.id, false);
      }
    };

    fetchIO();
  }, [trace.id, projectId, traceIO, isLoading, setTraceIO, setLoadingTraceIO, toast, trace.startTime, trace.endTime]);

  return (
    <div
      className={cn("flex w-full px-6 cursor-pointer pb-2", {
        "pb-6 border-b": isLast,
      })}
    >
      <div
        className="bg-secondary border rounded flex items-start overflow-clip w-full h-[140px] hover:border-muted-foreground/50"
        onClick={onClick}
      >
        {/* Details column */}
        <div className="flex flex-col h-full justify-between px-4 py-3 shrink-0 w-40">
          <div className="flex flex-col gap-1">
            <span className="text-xs text-secondary-foreground leading-4">{formatRelativeTime(trace.startTime)}</span>
            <CopyTooltip value={trace.id}>
              <span className="text-xs text-primary-foreground leading-4 truncate block" title={trace.id}>
                {trace.id}
              </span>
            </CopyTooltip>
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
        <div className="bg-muted/50 border-l flex-1 h-full min-w-0 overflow-hidden relative">
          <div className="h-full overflow-y-auto px-3 py-2">
            <TraceIOContent text={traceIO?.input} isLoading={isLoading} fallback="No input available" />
          </div>
          <div className="absolute bg-gradient-to-b bottom-0 from-transparent to-muted/50 h-12 left-0 right-0 pointer-events-none" />
        </div>

        {/* Output column */}
        <div className="bg-muted/50 border-l flex-1 h-full min-w-0 overflow-hidden relative">
          <div className="h-full overflow-y-auto px-3 py-2">
            <TraceIOContent text={traceIO?.output} isLoading={isLoading} fallback="No output available" />
          </div>
          <div className="absolute bg-gradient-to-b bottom-0 from-transparent to-muted/50 h-12 left-0 right-0 pointer-events-none" />
        </div>
      </div>
    </div>
  );
}

function TraceIOContent({
  text,
  isLoading,
  fallback,
}: {
  text: string | null | undefined;
  isLoading: boolean;
  fallback: string;
}) {
  if (isLoading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-3/5" />
      </div>
    );
  }

  if (!text) {
    return <p className="text-xs text-muted-foreground leading-4">{fallback}</p>;
  }

  return <Markdown output={text} className="text-muted-foreground [&_*]:text-inherit" contentClassName="pb-0" />;
}
