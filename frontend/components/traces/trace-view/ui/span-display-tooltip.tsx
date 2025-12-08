import React, { ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip.tsx";
import { cn } from "@/lib/utils.ts";

interface SpanDisplayTooltipProps {
  isLLM: boolean;
  name: string;
  children: ReactNode;
}

export const SpanDisplayTooltip = ({ name, isLLM, children }: SpanDisplayTooltipProps) => (
  <TooltipProvider disableHoverableContent={!isLLM}>
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent
        side="top"
        className={cn("text-sm p-2 text-center border whitespace-pre-wrap text-secondary-foreground")}
      >
        {name}
      </TooltipContent>
    </Tooltip>
  </TooltipProvider>
);
