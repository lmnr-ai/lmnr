"use client";

import { Info } from "lucide-react";
import { type ReactNode } from "react";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

// A client leaf so the comparison table can stay a server component.
//
// No local TooltipProvider: there is one app-wide in app/layout.tsx, and a
// provider per table row is a real render cost for nothing.
const InfoTooltip = ({ children }: { children: ReactNode }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <span className="inline-flex cursor-help align-middle text-foreground-400 transition-colors hover:text-foreground-200">
        <Info size={13} />
      </span>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
        {children}
      </TooltipContent>
    </TooltipPortal>
  </Tooltip>
);

export default InfoTooltip;
