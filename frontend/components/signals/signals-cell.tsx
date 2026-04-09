import { TooltipPortal } from "@radix-ui/react-tooltip";

import { DEFAULT_SIGNAL_COLOR } from "@/components/signals/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalsCellProps {
  signals: { name: string; color: string | null }[];
}

const SignalsCell = ({ signals }: SignalsCellProps) => {
  const count = signals.length;

  return (
    <TooltipProvider delayDuration={500}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5">
            <div className="flex flex-row items-center -space-x-2">
              {signals.map((signal) => (
                <div
                  key={signal.name}
                  className="size-4 rounded-full border-2 border-secondary"
                  style={{ backgroundColor: signal.color ?? DEFAULT_SIGNAL_COLOR }}
                />
              ))}
            </div>
            <span className="text-secondary-foreground text-xs">
              {count} signal{count === 1 ? "" : "s"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent side="bottom" className="px-3 py-2 border">
            <div className="flex flex-col gap-1.5 items-start text-secondary-foreground">
              {signals.map((signal) => (
                <div key={signal.name} className="flex flex-row items-center gap-2">
                  <div
                    className="size-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: signal.color ?? DEFAULT_SIGNAL_COLOR }}
                  />
                  <span className="text-xs">{signal.name}</span>
                </div>
              ))}
            </div>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
};

export default SignalsCell;
