import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn, formatTimestamp } from "@/lib/utils";

import type { VariantProps } from "../types";
import { hashGroupColor } from "../utils";

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
