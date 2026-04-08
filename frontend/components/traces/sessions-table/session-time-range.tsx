"use client";

import { format, isSameDay, isToday } from "date-fns";

import { TooltipContent } from "@/components/ui/tooltip";

const timeFormat: Intl.DateTimeFormatOptions = {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
};

const dateFormat: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
};

interface SessionTimeRangeProps {
  startTime: string;
  endTime: string;
}

function formatRange(start: Date, end: Date): string {
  const sameDay = isSameDay(start, end);
  const startIsToday = isToday(start);

  if (startIsToday && sameDay) {
    return `${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
  }

  const datePart = format(start, "MMM d");

  if (sameDay) {
    return `${datePart}, ${format(start, "h:mm a")} – ${format(end, "h:mm a")}`;
  }

  return `${datePart}, ${format(start, "h:mm a")} – ${format(end, "MMM d, h:mm a")}`;
}

export default function SessionTimeRange({ startTime, endTime }: SessionTimeRangeProps) {
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return <span className="text-sm text-secondary-foreground">{startTime}</span>;
  }

  return <span className="text-sm text-secondary-foreground truncate">{formatRange(start, end)}</span>;
}

export function TraceTimeTooltip({ startTime, endTime }: { startTime: string; endTime: string }) {
  const start = new Date(startTime);
  const end = new Date(endTime);
  const sameDay = start.toDateString() === end.toDateString();

  if (sameDay) {
    return (
      <TooltipContent className="border text-xs p-2">
        <div className="flex flex-col gap-0.5">
          <span className="text-muted-foreground tabular-nums">{start.toLocaleDateString([], dateFormat)}</span>
          <span className="tabular-nums">
            {start.toLocaleTimeString([], timeFormat)}
            {" – "}
            {end.toLocaleTimeString([], timeFormat)}
          </span>
        </div>
      </TooltipContent>
    );
  }

  return (
    <TooltipContent className="border text-xs p-2">
      <div className="flex flex-col gap-0.5">
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground tabular-nums">{start.toLocaleDateString([], dateFormat)}</span>
          <span className="tabular-nums">{start.toLocaleTimeString([], timeFormat)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-muted-foreground tabular-nums">{end.toLocaleDateString([], dateFormat)}</span>
          <span className="tabular-nums">{end.toLocaleTimeString([], timeFormat)}</span>
        </div>
      </div>
    </TooltipContent>
  );
}
