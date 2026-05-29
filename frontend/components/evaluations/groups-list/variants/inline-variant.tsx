import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import type { VariantProps } from "../types";

export default function InlineVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
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
                "flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left transition-colors",
                selected ? "bg-secondary" : "hover:bg-muted/60"
              )}
            >
              <span className="truncate text-sm font-medium">{g.groupId}</span>
              <span className="ml-auto inline-flex shrink-0 items-baseline gap-1.5 text-[11px] text-muted-foreground">
                <span className="tabular-nums">{g.runCount}</span>
                <span aria-hidden className="text-muted-foreground/60">·</span>
                <ClientTimestampFormatter
                  className="text-[11px] text-muted-foreground"
                  timestamp={g.lastEvaluationCreatedAt}
                />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
