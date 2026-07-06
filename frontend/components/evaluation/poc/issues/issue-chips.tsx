"use client";

import { AlertTriangle } from "lucide-react";
import { useState } from "react";

import { type AssignedIssueCluster } from "@/components/evaluation/poc/issues/mock-issues";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface IssueChipsProps {
  clusters: AssignedIssueCluster[];
  selectedId: string | null;
  onToggle: (id: string) => void;
}

/**
 * Slim chip row — smallest footprint, pairs with the stack (chips) mode.
 * Hover reveals the full description in a popover; click filters. Hover and
 * click are controlled independently (PopoverAnchor, not PopoverTrigger) so
 * clicking never fights the popover's open state.
 */
export default function IssueChips({ clusters, selectedId, onToggle }: IssueChipsProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {clusters.map((cluster) => (
        <Popover key={cluster.id} open={hoveredId === cluster.id} onOpenChange={(open) => !open && setHoveredId(null)}>
          <PopoverAnchor asChild>
            <button
              onMouseEnter={() => setHoveredId(cluster.id)}
              onMouseLeave={() => setHoveredId(null)}
              onClick={() => onToggle(cluster.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full border bg-background px-2.5 py-1 text-xs transition-colors hover:bg-muted",
                cluster.id === selectedId && "ring-2 ring-primary"
              )}
            >
              <AlertTriangle className="size-3" style={{ color: cluster.color }} />
              <span className="font-medium">{cluster.title}</span>
              <span className="text-muted-foreground">{cluster.indices.length}</span>
            </button>
          </PopoverAnchor>
          <PopoverContent side="bottom" align="start" className="w-72 text-xs text-muted-foreground">
            {cluster.description}
          </PopoverContent>
        </Popover>
      ))}
    </div>
  );
}
