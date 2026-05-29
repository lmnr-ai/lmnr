import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import RunCountBadge from "../run-count-badge";
import type { VariantProps } from "../types";
import { hashGroupColor } from "../utils";

export default function ListVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
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
                "group flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                selected ? "bg-accent" : "hover:bg-muted/60"
              )}
            >
              <span
                className={cn(
                  "h-7 w-0.5 shrink-0 rounded-full",
                  selected ? hashGroupColor(g.groupId) : "bg-transparent"
                )}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn("truncate text-sm font-medium", selected ? "text-foreground" : "text-foreground/90")}
                >
                  {g.groupId}
                </span>
                <ClientTimestampFormatter
                  className="text-[11px] text-muted-foreground"
                  timestamp={g.lastEvaluationCreatedAt}
                />
              </div>
              <RunCountBadge count={g.runCount} selected={selected} />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
