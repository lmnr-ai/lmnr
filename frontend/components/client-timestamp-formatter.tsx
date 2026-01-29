"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds, format } from "date-fns";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatTimestamp } from "@/lib/utils.ts";

function formatShortRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = differenceInSeconds(now, date);
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);

  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto", style: "narrow" });

  if (seconds < 60) {
    return rtf.format(-seconds, "second");
  } else if (minutes < 60) {
    return rtf.format(-minutes, "minute");
  } else if (hours < 24) {
    return rtf.format(-hours, "hour");
  } else {
    return rtf.format(-days, "day");
  }
}

export default function ClientTimestampFormatter({ timestamp, className }: { timestamp: string; className?: string }) {
  const date = new Date(timestamp);
  const days = differenceInDays(new Date(), date);
  const displayText = days < 7 ? formatShortRelativeTime(date) : formatTimestamp(timestamp);
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
