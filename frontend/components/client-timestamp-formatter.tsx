"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { differenceInDays, format, formatDistanceToNowStrict } from "date-fns";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatTimestamp } from "@/lib/utils.ts";

export default function ClientTimestampFormatter({ timestamp, className }: { timestamp: string; className?: string }) {
  const date = new Date(timestamp);
  const days = differenceInDays(new Date(), date);
  const displayText = days < 7 ? formatDistanceToNowStrict(date, { addSuffix: true }) : formatTimestamp(timestamp);
  const tooltipText = format(date, "MMMM d, yyyy, h:mm a O");

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn("text-secondary-foreground cursor-pointer", className)}>{displayText}</span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent className="border">
            <span>{tooltipText}</span>
          </TooltipContent>
        </TooltipPortal>
      </Tooltip>
    </TooltipProvider>
  );
}
