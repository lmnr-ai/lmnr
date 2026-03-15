"use client";

import { CalendarDays, CheckCircle, Clock, DollarSign, ExternalLink, Hash, XCircle } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback } from "react";

import MiniTimeline from "@/components/laminar-agent/cards/mini-timeline";
import { Button } from "@/components/ui/button";

interface TraceCardProps {
  traceId: string;
  topSpanName: string;
  duration: number;
  totalCost: number;
  totalTokens: number;
  timestamp: string;
  status: string;
}

function formatDuration(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}us`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
  return `${seconds.toFixed(2)}s`;
}

function formatCost(cost: number): string {
  if (cost === 0) return "$0";
  if (cost < 0.001) return `$${cost.toExponential(1)}`;
  return `$${cost.toFixed(4)}`;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function TraceCard({ props }: { props: TraceCardProps }) {
  const { traceId, topSpanName, duration, totalCost, totalTokens, timestamp, status } = props;
  const { projectId } = useParams();

  const openTrace = useCallback(() => {
    window.open(`/project/${projectId}/traces/${traceId}`, "_blank");
  }, [projectId, traceId]);

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex items-center justify-between px-4 py-3 border-b">
        <div className="flex items-center gap-2 min-w-0">
          {status === "error" ? (
            <XCircle className="w-4 h-4 text-destructive shrink-0" />
          ) : (
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          )}
          <span className="font-medium text-sm truncate">{topSpanName}</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs shrink-0" onClick={openTrace}>
          Open trace
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="w-3.5 h-3.5" />
          <span>{formatDuration(duration)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <DollarSign className="w-3.5 h-3.5" />
          <span>{formatCost(totalCost)}</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Hash className="w-3.5 h-3.5" />
          <span>{totalTokens.toLocaleString()} tokens</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>{formatTimestamp(timestamp)}</span>
        </div>
      </div>
      <div className="px-4 pb-3">
        <MiniTimeline traceId={traceId} />
      </div>
    </div>
  );
}
