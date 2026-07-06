"use client";

import { X } from "lucide-react";

import { type AssignedIssueCluster } from "@/components/evaluation/poc/issues/mock-issues";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface IssuesRailProps {
  clusters: AssignedIssueCluster[];
  selectedId: string | null;
  onToggle: (id: string) => void;
}

/** Fixed vertical ranked list beside the table — persistent, never costs table rows. */
export default function IssuesRail({ clusters, selectedId, onToggle }: IssuesRailProps) {
  const maxCount = Math.max(...clusters.map((c) => c.indices.length), 1);

  return (
    <div className="flex w-[300px] shrink-0 flex-col gap-1 overflow-y-auto rounded-md border p-2">
      <span className="px-1 pb-1 text-xs font-medium text-muted-foreground">Recurring issues</span>
      {clusters.map((cluster) => {
        const selected = cluster.id === selectedId;
        return (
          <div key={cluster.id} className={cn("rounded-md", selected && "bg-secondary")}>
            <button
              onClick={() => onToggle(cluster.id)}
              className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate font-medium">{cluster.title}</span>
                <span className="shrink-0 text-muted-foreground">{cluster.indices.length}</span>
              </div>
              <div className="h-1 w-full rounded-full bg-muted">
                <div
                  className="h-1 rounded-full"
                  style={{
                    width: `${(cluster.indices.length / maxCount) * 100}%`,
                    backgroundColor: cluster.color,
                  }}
                />
              </div>
            </button>
            {selected && (
              <div className="flex items-start gap-1.5 px-2 pb-2">
                <p className="flex-1 text-xs text-muted-foreground">{cluster.description}</p>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-5 shrink-0"
                  onClick={() => onToggle(cluster.id)}
                  title="Clear filter"
                >
                  <X className="size-3" />
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
