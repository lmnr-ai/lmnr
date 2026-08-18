"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { CircleAlert, CircleCheck, CircleDashed, TriangleAlert } from "lucide-react";
import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { EVALUATION_STATUS_LABELS, type EvaluationStatus } from "@/lib/evaluation/status";
import { type Evaluation } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

const STATUS_ICONS: Record<EvaluationStatus, { icon: ReactNode; className: string }> = {
  running: { icon: <CircleDashed size={14} />, className: "text-muted-foreground" },
  incomplete: { icon: <TriangleAlert size={14} />, className: "text-amber-500" },
  complete: { icon: <CircleCheck size={14} />, className: "text-success" },
  completeWithErrors: { icon: <CircleAlert size={14} />, className: "text-destructive" },
};

export const EvaluationStatusCell = ({ row }: { row: { original: Evaluation } }) => {
  const status = row.original.status;
  const counts = row.original.statusCounts;

  if (status == null) {
    return (
      <div className="flex items-center justify-center">
        <span className="text-muted-foreground">—</span>
      </div>
    );
  }

  const { icon, className } = STATUS_ICONS[status];
  const complete = counts ? Math.min(counts.total, Math.max(0, counts.complete)) : 0;
  const showProgress = counts != null && counts.total > 0 && complete < counts.total;

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center justify-center", className)}>{icon}</div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>
          <div className="flex flex-col gap-0.5">
            <span>{EVALUATION_STATUS_LABELS[status]}</span>
            {showProgress && counts && (
              <span className="text-muted-foreground">
                {complete} of {counts.total} complete
              </span>
            )}
          </div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
