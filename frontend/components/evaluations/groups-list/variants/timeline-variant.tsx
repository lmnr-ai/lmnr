import { differenceInDays } from "date-fns";
import { useMemo } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { cn } from "@/lib/utils";

import RunCountBadge from "../run-count-badge";
import type { EvaluationGroup, VariantProps } from "../types";
import { hashGroupColor } from "../utils";

function bucketLabel(d: Date): string {
  const days = differenceInDays(new Date(), d);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return "This week";
  if (days < 30) return "This month";
  if (days < 90) return "Last 3 months";
  return "Older";
}

export default function TimelineVariant({ groups, selectedGroupId, onSelect }: VariantProps) {
  const buckets = useMemo(() => {
    const order: string[] = [];
    const map = new Map<string, EvaluationGroup[]>();
    for (const g of groups) {
      const label = bucketLabel(new Date(g.lastEvaluationCreatedAt));
      if (!map.has(label)) {
        map.set(label, []);
        order.push(label);
      }
      map.get(label)!.push(g);
    }
    return order.map((label) => ({ label, items: map.get(label)! }));
  }, [groups]);

  return (
    <div className="relative pl-5 py-1">
      <div className="absolute left-[10px] top-2 bottom-2 w-px bg-border" />
      <div className="flex flex-col gap-3">
        {buckets.map(({ label, items }) => (
          <div key={label} className="flex flex-col gap-1">
            <div className="-ml-5 mb-0.5 flex items-center gap-2 text-[11px] font-medium text-muted-foreground">
              <span className="ml-[6px] inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/50" />
              {label}
            </div>
            <div className="flex flex-col gap-1">
              {items.map((g) => {
                const selected = g.groupId === selectedGroupId;
                return (
                  <button
                    key={g.groupId}
                    type="button"
                    onClick={() => onSelect(g.groupId)}
                    className="relative flex items-start gap-2 rounded-md py-1 pr-1 text-left"
                  >
                    <span
                      className={cn(
                        "absolute -left-[13px] top-2 inline-block h-2 w-2 rounded-full ring-2 ring-background",
                        selected ? hashGroupColor(g.groupId) : "bg-muted-foreground/40"
                      )}
                    />
                    <div
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1 transition-colors",
                        selected ? "bg-accent" : "hover:bg-muted/60"
                      )}
                    >
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{g.groupId}</span>
                        <ClientTimestampFormatter
                          className="text-[11px] text-muted-foreground"
                          timestamp={g.lastEvaluationCreatedAt}
                        />
                      </div>
                      <RunCountBadge count={g.runCount} selected={selected} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
