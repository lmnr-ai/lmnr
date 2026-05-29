import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import type { VariantProps } from "../types";
import { groupInitials, hashGroupColor } from "../utils";

export default function CardsVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  return (
    <div className="grid grid-cols-2 gap-2 py-1">
      {groups.map((g) => {
        const selected = g.groupId === selectedGroupId;
        return (
          <button
            key={g.groupId}
            type="button"
            onClick={() => onSelect(g.groupId)}
            className={cn(
              "group flex flex-col gap-2 rounded-md border p-2 text-left transition-colors",
              selected
                ? "border-primary/50 bg-primary/5 ring-1 ring-primary/30"
                : "border-border/60 bg-card hover:border-border hover:bg-muted/40"
            )}
          >
            <div className="flex items-start justify-between gap-1.5">
              <div
                className={cn(
                  "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-[10px] font-semibold text-white",
                  hashGroupColor(g.groupId)
                )}
              >
                {groupInitials(g.groupId)}
              </div>
              <div className="flex flex-col items-end">
                <span className="text-base font-semibold leading-none tabular-nums">{g.runCount}</span>
                <span className="text-[9px] text-muted-foreground">runs</span>
              </div>
            </div>
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <span className="truncate text-xs font-medium" title={g.groupId}>
                {g.groupId}
              </span>
              <ClientTimestampFormatter
                className="text-[10px] text-muted-foreground"
                timestamp={g.lastEvaluationCreatedAt}
              />
            </div>
          </button>
        );
      })}
    </div>
  );
}
