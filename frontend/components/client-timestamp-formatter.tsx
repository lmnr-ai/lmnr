"use client";

import { TooltipPortal } from "@radix-ui/react-tooltip";
import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds, format } from "date-fns";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatTimestamp } from "@/lib/utils.ts";

export function formatShortRelativeTime(date: Date): string {
  const now = new Date();
  const seconds = differenceInSeconds(now, date);
  const minutes = differenceInMinutes(now, date);
  const hours = differenceInHours(now, date);
  const days = differenceInDays(now, date);

  // numeric: "always" — "auto" renders -1 day as "yesterday", which is wrong for
  // most of the 24-48h window that differenceInDays maps to 1.
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "always", style: "narrow" });

  if (seconds < 1) {
    return "now";
  } else if (seconds < 60) {
    return rtf.format(-seconds, "second");
  } else if (minutes < 60) {
    return rtf.format(-minutes, "minute");
  } else if (hours < 24) {
    return rtf.format(-hours, "hour");
  } else {
    return rtf.format(-days, "day");
  }
}

export default function ClientTimestampFormatter({
  timestamp,
  className,
  absolute = false,
}: {
  timestamp: string;
  className?: string;
  absolute?: boolean;
}) {
  const date = new Date(timestamp);

  if (isNaN(date.getTime())) {
    return <span className={cn("text-sm", className)}>{timestamp}</span>;
  }

  const days = differenceInDays(new Date(), date);
  const displayText = absolute
    ? formatTimestamp(timestamp)
    : days < 7
      ? formatShortRelativeTime(date)
      : formatTimestamp(timestamp);
  const tooltipText = format(date, "MMMM d, yyyy, h:mm:ss a O");

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <span className={cn("text-sm cursor-pointer", className)}>{displayText}</span>
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
