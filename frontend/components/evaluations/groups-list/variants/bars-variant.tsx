import { useMemo } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import type { VariantProps } from "../types";
import { hashGroupColor } from "../utils";

export default function BarsVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  const maxRuns = useMemo(() => Math.max(1, ...groups.map((g) => g.runCount)), [groups]);

  return (
    <ul className="flex flex-col gap-px py-1">
      {groups.map((g) => {
        const selected = g.groupId === selectedGroupId;
        const pct = Math.max(4, Math.round((g.runCount / maxRuns) * 100));
        return (
          <li key={g.groupId}>
            <button
              type="button"
              onClick={() => onSelect(g.groupId)}
              className={cn(
                "group relative flex w-full flex-col gap-1 overflow-hidden rounded-md border px-2 py-1.5 text-left transition-colors",
                selected ? "border-primary/50 bg-primary/5" : "border-transparent hover:bg-muted/60"
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium">{g.groupId}</span>
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold tabular-nums",
                    selected ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {g.runCount}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted/70">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all",
                      hashGroupColor(g.groupId),
                      !selected && "opacity-70"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <ClientTimestampFormatter
                  className="shrink-0 text-[10px] text-muted-foreground"
                  timestamp={g.lastEvaluationCreatedAt}
                />
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
