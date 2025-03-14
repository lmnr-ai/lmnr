import { cn } from '../../lib/utils';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '../ui/tooltip';

export function NoSpanTooltip({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger>
          {children}
        </TooltipTrigger>
        <TooltipContent side="bottom" className={cn("p-0 border", className)}>
          <div className="p-1 whitespace-pre-wrap text-secondary-foreground">
            Top level span was not received
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
