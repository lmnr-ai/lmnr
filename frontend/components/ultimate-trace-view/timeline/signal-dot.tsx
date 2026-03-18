import { memo, useCallback } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface SignalDotProps {
  color: string;
  signalName: string;
  signalId: string;
  onClick: (signalId: string) => void;
  /** Offset index for stacking multiple dots */
  index: number;
}

function SignalDot({ color, signalName, signalId, onClick, index }: SignalDotProps) {
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick(signalId);
    },
    [onClick, signalId]
  );

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className="absolute z-30 size-2.5 rounded-full cursor-pointer transition-transform hover:scale-150 ring-1 ring-background"
            style={{
              backgroundColor: color,
              top: -3,
              right: -3 + index * 6,
            }}
            onClick={handleClick}
          />
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {signalName}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export default memo(SignalDot);
