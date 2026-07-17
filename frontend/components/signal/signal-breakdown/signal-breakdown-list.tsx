"use client";

import { useMemo } from "react";

import ClusterListEmptyState from "@/components/signal/clusters-section/cluster-list/empty-state";
import { cn } from "@/lib/utils";

import SignalBreakdownItem from "./signal-breakdown-item";
import { type BreakdownNode } from "./types";

interface Props {
  /** The buckets visible at the current drill level. */
  nodes: BreakdownNode[];
  selectedId: string | null;
  filteredCountByBucket: Map<string, number>;
  /** Total events in range — denominator for the global proportion bars. */
  rangeTotal: number;
  /** Depth 0 shows the "no buckets" empty copy; deeper shows "no sub-items". */
  isRoot: boolean;
  onNavigate: (id: string) => void;
  className?: string;
  isPaywall?: boolean;
}

export default function SignalBreakdownList({
  nodes,
  selectedId,
  filteredCountByBucket,
  rangeTotal,
  isRoot,
  onNavigate,
  className,
  isPaywall,
}: Props) {
  // Regular buckets sort empties (0 in range) to the bottom; catch-alls
  // (Unclustered / Unversioned / None) always render in a divided section below.
  const { regular, catchAll } = useMemo(() => {
    const reg = nodes
      .filter((n) => !n.isCatchAll)
      .sort((a, b) => {
        const aEmpty = (filteredCountByBucket.get(a.id) ?? 0) > 0 ? 0 : 1;
        const bEmpty = (filteredCountByBucket.get(b.id) ?? 0) > 0 ? 0 : 1;
        return aEmpty - bEmpty;
      });
    return { regular: reg, catchAll: nodes.filter((n) => n.isCatchAll) };
  }, [nodes, filteredCountByBucket]);

  if (nodes.length === 0) {
    return (
      <div className={cn("border-r bg-secondary overflow-hidden min-w-0", className)}>
        <ClusterListEmptyState title={isRoot ? "No buckets during this period" : "No sub-items"} />
      </div>
    );
  }

  return (
    <div className={cn("border-r bg-secondary overflow-y-auto overflow-x-hidden min-w-0", className)}>
      <div className="flex flex-col gap-0.5 py-2 px-2 min-w-0">
        {regular.map((node) => (
          <SignalBreakdownItem
            key={node.id}
            node={node}
            isSelected={selectedId === node.id}
            filteredCount={filteredCountByBucket.get(node.id)}
            total={rangeTotal}
            onClick={() => onNavigate(node.id)}
            isPaywall={isPaywall}
          />
        ))}
        {catchAll.length > 0 && (
          <>
            {regular.length > 0 && <div className="border-t my-1" />}
            {catchAll.map((node) => (
              <SignalBreakdownItem
                key={node.id}
                node={node}
                isSelected={selectedId === node.id}
                filteredCount={filteredCountByBucket.get(node.id)}
                total={rangeTotal}
                onClick={() => onNavigate(node.id)}
                isPaywall={isPaywall}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
