import { TooltipPortal } from "@radix-ui/react-tooltip";
import React, { type PropsWithChildren } from "react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

interface SpanDisplayTooltipProps {
  isLLM: boolean;
  name: string;
}

export const SpanDisplayTooltip = ({ name, isLLM, children }: PropsWithChildren<SpanDisplayTooltipProps>) => {
  if (isLLM) {
    return (
      <Tooltip delayDuration={100}>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
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
    );
  }

  return children;
};
