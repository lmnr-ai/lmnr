"use client";

import { ArrowUpRight } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HeaderLinkButtonProps {
  icon: ReactNode;
  label: string;
  tooltip: string;
  onClick: () => void;
  className?: string;
}

export const HeaderLinkButton = ({ icon, label, tooltip, onClick, className }: HeaderLinkButtonProps) => (
  <Tooltip delayDuration={400}>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="sm" onClick={onClick} className={cn("h-7 hover:bg-surface-up", className)}>
        {icon}
        <span className="truncate ml-1">{label}</span>
        <ArrowUpRight size={12} className="ml-1 flex-shrink-0" />
      </Button>
    </TooltipTrigger>
    <TooltipPortal>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </TooltipPortal>
  </Tooltip>
);
