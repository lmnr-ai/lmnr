"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { Check, CircleDashed, CircleSlash, X } from "lucide-react";
import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DATAPOINT_STATUS_LABELS, datapointBuckets } from "@/lib/evaluation/status";
import { type Evaluation } from "@/lib/evaluation/types";

const Bucket = ({ count, label, icon }: { count: number; label: string; icon: ReactNode }) => {
  if (count <= 0) return null;

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <span className="inline-flex items-center gap-1 text-secondary-foreground">
          {icon}
          {count}
        </span>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{label}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};

export const EvaluationDatapointsCell = ({ row }: { row: { original: Evaluation } }) => {
  const counts = row.original.statusCounts;
  if (!counts || counts.total <= 0) {
    return <span className="text-muted-foreground">—</span>;
  }

  const { complete, inProgress, stale, errored } = datapointBuckets(counts);

  return (
    <div className="flex items-center gap-3 text-xs tabular-nums whitespace-nowrap">
      <Bucket
        count={complete}
        label={DATAPOINT_STATUS_LABELS.complete}
        icon={<Check className="size-3 text-success" />}
      />
      <Bucket
        count={inProgress}
        label={DATAPOINT_STATUS_LABELS.running}
        icon={<CircleDashed className="size-3 text-muted-foreground" />}
      />
      <Bucket
        count={stale}
        label={DATAPOINT_STATUS_LABELS.stale}
        icon={<CircleSlash className="size-3 text-muted-foreground/50" />}
      />
      <Bucket count={errored} label={DATAPOINT_STATUS_LABELS.error} icon={<X className="size-3 text-destructive" />} />
    </div>
  );
};
