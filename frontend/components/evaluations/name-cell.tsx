import { Cloud } from "lucide-react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { type Evaluation } from "@/lib/evaluation/types";

/** The evaluation's name, with a cloud icon when it ran on Laminar (`lmnr-cli eval run --remote`), not locally. */
export default function NameCell({ evaluation }: { evaluation: Evaluation }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <span className="truncate">{evaluation.name}</span>
      {evaluation.hostedMetadata && (
        <TooltipProvider delayDuration={0}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Cloud aria-label="Run on Laminar Cloud" className="size-3.5 shrink-0 text-secondary-foreground" />
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="top" className="text-xs">
                This evaluation was run on Laminar Cloud
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
