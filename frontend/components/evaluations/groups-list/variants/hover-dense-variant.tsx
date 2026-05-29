import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import type { VariantProps } from "../types";

export default function HoverDenseVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  return (
    <ul className="flex flex-col py-1">
      {groups.map((g) => {
        const selected = g.groupId === selectedGroupId;
        const runLabel = g.runCount === 1 ? "1 run" : `${g.runCount} runs`;
        return (
          <li key={g.groupId}>
            <button
              type="button"
              onClick={() => onSelect(g.groupId)}
              className={cn(
                "group flex w-full items-baseline gap-2 rounded-md px-2 py-1 text-left transition-colors",
                selected ? "bg-secondary" : "hover:bg-muted/60"
              )}
            >
              <span className="truncate text-sm font-medium">{g.groupId}</span>
              <span
                className={cn(
                  "ml-auto inline-flex shrink-0 items-baseline gap-1.5 text-[11px] text-muted-foreground transition-opacity",
                  selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                )}
              >
                <ClientTimestampFormatter
                  className="text-[11px] text-muted-foreground"
                  timestamp={g.lastEvaluationCreatedAt}
                />
                <span aria-hidden className="text-muted-foreground/60">·</span>
                <span className="tabular-nums">{runLabel}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
