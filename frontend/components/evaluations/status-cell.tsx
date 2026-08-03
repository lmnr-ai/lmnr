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

const Row = ({ label, value }: { label: string; value: ReactNode }) => (
  <div className="flex justify-between gap-4 text-xs">
    <span className="text-secondary-foreground">{label}</span>
    <span className="tabular-nums">{value}</span>
  </div>
);

/**
 * Run status pill. The tooltip always shows the counters the status was derived
 * from, because with no expected-datapoint count the label alone can't tell the
 * user WHICH half is missing (root spans vs scores).
 */
export const EvaluationStatusCell = ({ row }: { row: { original: Evaluation } }) => {
  const status = row.original.status ?? "empty";
  const counts = row.original.statusCounts;
  const { icon, className } = STATUS_ICONS[status];
  const label = EVALUATION_STATUS_LABELS[status];

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <div className={cn("flex items-center gap-1.5 truncate", className)}>
          {icon}
          <span className="truncate text-xs">{label}</span>
        </div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent className="flex min-w-50 flex-col gap-1 border p-2">
          <span className="text-xs font-medium">{label}</span>
          {counts && counts.total > 0 ? (
            <>
              <Row label="Datapoints" value={counts.total} />
              <Row label="Root span arrived" value={`${counts.rooted} / ${counts.total}`} />
              <Row label="Scores arrived" value={`${counts.scored} / ${counts.total}`} />
              {counts.errored > 0 && <Row label="Errored traces" value={counts.errored} />}
            </>
          ) : (
            <span className="text-xs text-secondary-foreground">This run has no datapoints yet.</span>
          )}
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
