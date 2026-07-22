import React, { type PropsWithChildren } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

interface SpanDisplayTooltipProps {
  isLLM: boolean;
  name: string;
}

export const SpanDisplayTooltip = ({ name, isLLM, children }: PropsWithChildren<SpanDisplayTooltipProps>) => {
  if (isLLM) {
    return (
      <TooltipProvider delay={100}>
        <Tooltip>
          <TooltipTrigger render={children as React.ReactElement} />
          <TooltipContent
            side="top"
            align="start"
            className={cn("text-sm p-2 text-center border whitespace-pre-wrap text-secondary-foreground")}
          >
            {name}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return children;
};
