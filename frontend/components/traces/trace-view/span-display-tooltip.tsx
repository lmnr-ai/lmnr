import { TooltipPortal } from "@radix-ui/react-tooltip";
import React, { PropsWithChildren } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

interface SpanDisplayTooltipProps {
  isLLM: boolean;
  name: string;
}

export const SpanDisplayTooltip = ({ name, isLLM, children }: PropsWithChildren<SpanDisplayTooltipProps>) => {
  if (isLLM) {
    return (
      <TooltipProvider delayDuration={100}>
        <Tooltip>
          <TooltipTrigger>{children}</TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              side="top"
              align="start"
              className={cn("text-sm p-2 text-center border whitespace-pre-wrap text-secondary-foreground")}
            >
              {name}
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return children;
};
