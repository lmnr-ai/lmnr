import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import type { VariantProps } from "../types";

export default function LeadingCountVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  return (
    <ul className="flex flex-col gap-px py-1">
      {groups.map((g) => {
        const selected = g.groupId === selectedGroupId;
        return (
          <li key={g.groupId}>
            <button
              type="button"
              onClick={() => onSelect(g.groupId)}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                selected ? "bg-secondary" : "hover:bg-muted/60"
              )}
            >
              <span
                aria-label={`${g.runCount} runs`}
                className={cn(
                  "flex w-7 shrink-0 items-baseline justify-end gap-0.5 font-medium tabular-nums",
                  selected ? "text-foreground" : "text-muted-foreground/80"
                )}
              >
                <span className="text-base leading-none">{g.runCount}</span>
                <span className="text-[9px] leading-none text-muted-foreground/70">×</span>
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{g.groupId}</span>
                <ClientTimestampFormatter
                  className="text-[11px] text-muted-foreground"
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
