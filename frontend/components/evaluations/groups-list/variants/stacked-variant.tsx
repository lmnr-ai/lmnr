import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import type { VariantProps } from "../types";

export default function StackedVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  return (
    <ul className="flex flex-col gap-px py-1">
      {groups.map((g) => {
        const selected = g.groupId === selectedGroupId;
        const runLabel = g.runCount === 1 ? "1 run" : `${g.runCount} runs`;
        return (
          <li key={g.groupId}>
            <button
              type="button"
              onClick={() => onSelect(g.groupId)}
              className={cn(
                "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors",
                selected ? "bg-secondary" : "hover:bg-muted/60"
              )}
            >
              <span className="truncate text-sm font-medium">{g.groupId}</span>
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <ClientTimestampFormatter className="text-[11px] text-muted-foreground" timestamp={g.lastEvaluationCreatedAt} />
                <span aria-hidden>·</span>
                <span className="tabular-nums">{runLabel}</span>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
