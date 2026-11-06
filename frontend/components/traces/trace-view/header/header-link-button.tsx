"use client";

import { ArrowUpRight } from "lucide-react";
import { type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HeaderLinkButtonProps {
  icon: ReactNode;
  label: string;
  /** Omit when the button sits inside a richer hover preview. */
  tooltip?: string;
  onClick: () => void;
  className?: string;
}

export const HeaderLinkButton = ({ icon, label, tooltip, onClick, className }: HeaderLinkButtonProps) => {
  const button = (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("h-7 bg-emphasis-1 hover:overlay-hover active:overlay-selected", className)}
    >
      {icon}
      <span className="truncate ml-1">{label}</span>
      <ArrowUpRight size={12} className="ml-1 flex-shrink-0" />
    </Button>
  );
  if (!tooltip) return button;

  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
};
