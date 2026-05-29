import { differenceInDays, differenceInHours, differenceInMinutes, format } from "date-fns";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatTimestamp } from "@/lib/utils";

import type { VariantProps } from "../types";
import { hashGroupColor } from "../utils";

// Compact relative date for density-optimised chips: "5m", "3h", "2d", "4w", or "Jan 4" for older.
function formatChipDate(iso: string): string {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return "";
  const now = new Date();
  const mins = differenceInMinutes(now, date);
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = differenceInHours(now, date);
  if (hours < 24) return `${hours}h`;
  const days = differenceInDays(now, date);
  if (days < 7) return `${days}d`;
  if (days < 28) return `${Math.floor(days / 7)}w`;
  return format(date, "MMM d");
}

export default function ChipsVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex flex-wrap gap-1.5 py-1">
        {groups.map((g) => {
          const selected = g.groupId === selectedGroupId;
          return (
            <Tooltip key={g.groupId}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onSelect(g.groupId)}
                  className={cn(
                    "group inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition-colors",
                    selected
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border/60 bg-card text-foreground/80 hover:border-border hover:bg-muted/60"
                  )}
                >
                  <span className={cn("inline-block h-1.5 w-1.5 rounded-full", hashGroupColor(g.groupId))} />
                  <span className="max-w-[160px] truncate font-medium">{g.groupId}</span>
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums",
                      selected ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {g.runCount}
                  </span>
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {formatChipDate(g.lastEvaluationCreatedAt)}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="border text-xs">
                <div className="flex flex-col gap-0.5">
                  <span className="font-medium">{g.groupId}</span>
                  <span className="text-muted-foreground">
                    {g.runCount} {g.runCount === 1 ? "run" : "runs"} · last {formatTimestamp(g.lastEvaluationCreatedAt)}
                  </span>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
