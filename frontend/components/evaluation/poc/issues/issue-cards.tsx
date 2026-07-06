"use client";

import { type AssignedIssueCluster } from "@/components/evaluation/poc/issues/mock-issues";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface IssueCardsProps {
  clusters: AssignedIssueCluster[];
  selectedId: string | null;
  onToggle: (id: string) => void;
}

/** Horizontal-scroll cards — the full-real-estate representation, pairs with the tabs mode. */
export default function IssueCards({ clusters, selectedId, onToggle }: IssueCardsProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {clusters.map((cluster) => {
        const selected = cluster.id === selectedId;
        return (
          <button
            key={cluster.id}
            onClick={() => onToggle(cluster.id)}
            className={cn(
              "flex w-64 shrink-0 flex-col gap-1 rounded-md border bg-background p-3 text-left transition-colors hover:bg-muted",
              selected && "ring-2 ring-primary"
            )}
            style={{ borderLeftColor: cluster.color, borderLeftWidth: 3 }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-sm font-medium">{cluster.title}</span>
              <Badge variant="secondary" className="shrink-0 text-[0.7rem]">
                {cluster.indices.length} datapoints
              </Badge>
            </div>
            <p className="line-clamp-3 text-xs text-muted-foreground">{cluster.description}</p>
          </button>
        );
      })}
    </div>
  );
}
