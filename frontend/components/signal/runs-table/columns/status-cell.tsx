"use client";

import { Check, CircleHelp, Clock, Loader2, type LucideIcon, X } from "lucide-react";

import { type SignalRunStatus } from "@/lib/actions/signal-runs/types";
import { cn } from "@/lib/utils";

// Stage labels in pipeline order: Pending is waiting on the agent, Processing is the agent working.
export const SIGNAL_RUN_STATUS_LABELS: Record<SignalRunStatus, string> = {
  PENDING: "Pending",
  PROCESSING: "Processing",
  COMPLETED: "Completed",
  FAILED: "Failed",
  UNKNOWN: "Unknown",
};

const STATUS_DISPLAY: Record<SignalRunStatus, { icon: LucideIcon; className: string }> = {
  PENDING: { icon: Clock, className: "text-muted-foreground" },
  PROCESSING: { icon: Loader2, className: "text-muted-foreground" },
  COMPLETED: { icon: Check, className: "text-muted-foreground" },
  FAILED: { icon: X, className: "text-destructive" },
  UNKNOWN: { icon: CircleHelp, className: "text-muted-foreground" },
};

export const StatusCell = ({ status }: { status: SignalRunStatus }) => {
  const display = STATUS_DISPLAY[status] ?? STATUS_DISPLAY.UNKNOWN;
  const Icon = display.icon;

  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", display.className)}>
      <Icon className={cn("size-3.5 shrink-0", status === "PROCESSING" && "animate-spin")} />
      <span className="text-xs truncate">{SIGNAL_RUN_STATUS_LABELS[status] ?? SIGNAL_RUN_STATUS_LABELS.UNKNOWN}</span>
    </div>
  );
};
