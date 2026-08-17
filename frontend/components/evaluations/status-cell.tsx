"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CircleAlert, CircleCheck, CircleSlash, Loader2, TriangleAlert } from "lucide-react";
import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EVALUATION_STATUS_LABELS, type EvaluationStatus } from "@/lib/evaluation/status";
import { type Evaluation } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

const STATUS_ICONS: Record<EvaluationStatus, { icon: ReactNode; className: string }> = {
  empty: { icon: <CircleSlash size={14} />, className: "text-muted-foreground" },
  running: { icon: <Loader2 size={14} className="animate-spin" />, className: "text-muted-foreground" },
  incomplete: { icon: <TriangleAlert size={14} />, className: "text-amber-500" },
  finished: { icon: <CircleCheck size={14} />, className: "text-success" },
  finishedWithErrors: { icon: <CircleAlert size={14} />, className: "text-destructive" },
};

export const EvaluationStatusCell = ({ row }: { row: { original: Evaluation } }) => {
  const status = row.original.status ?? "empty";
  const { icon, className } = STATUS_ICONS[status];

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center justify-center", className)}>{icon}</div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{EVALUATION_STATUS_LABELS[status]}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
