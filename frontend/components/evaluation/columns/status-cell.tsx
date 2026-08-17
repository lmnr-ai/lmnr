import { CircleAlert, CircleCheck, CircleDashed, CircleSlash } from "lucide-react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { DATAPOINT_STATUS_LABELS, deriveDatapointStatus } from "@/lib/evaluation/status";
import { type EvalRow } from "@/lib/evaluation/types";

const STATUS_ICON = {
  error: <CircleAlert className="text-destructive" size={14} />,
  complete: <CircleCheck className="text-success" size={14} />,
  stale: <CircleSlash className="text-muted-foreground/50" size={14} />,
  running: <CircleDashed className="text-muted-foreground" size={14} />,
} as const;

export const StatusCell = ({ row }: { row: { original: EvalRow } }) => {
  const status = deriveDatapointStatus(row.original);

  return (
    <Tooltip delayDuration={250}>
      <TooltipTrigger asChild>
        <div className="flex h-full justify-center items-center w-8">{STATUS_ICON[status]}</div>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent>{DATAPOINT_STATUS_LABELS[status]}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
