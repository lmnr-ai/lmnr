import { TooltipPortal } from "@radix-ui/react-tooltip";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalsCellProps {
  signals: { name: string }[];
}

const SignalsCell = ({ signals }: SignalsCellProps) => {
  const count = signals.length;

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="text-secondary-foreground text-xs">
            {count} signal{count === 1 ? "" : "s"}
          </span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="px-3 py-2 border">
            <div className="flex flex-col gap-1 items-start text-secondary-foreground">
              {signals.map((signal) => (
                <span key={signal.name} className="text-xs">
                  {signal.name}
                </span>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SignalsCell;
