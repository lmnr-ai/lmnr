import { cn } from "../../lib/utils";
import { Tooltip, TooltipContent, TooltipPortal, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

export function NoSpanTooltip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>{children}</TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className={cn("p-0", className)}>
            <div className="p-1 whitespace-pre-wrap text-secondary-foreground">Top level span was not received</div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
