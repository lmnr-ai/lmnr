import { TooltipPortal } from "@radix-ui/react-tooltip";

import { cn } from "@/lib/utils.ts";

import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";

export function NoSpanTooltip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <Tooltip delayDuration={100}>
      <TooltipTrigger>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom" className={cn("p-0 border", className)}>
          <div className="p-1 whitespace-pre-wrap text-secondary-foreground">Top level span was not received</div>
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}
