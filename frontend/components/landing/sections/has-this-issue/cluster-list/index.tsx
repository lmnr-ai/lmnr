"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMemo } from "react";

import { type IconVariant } from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import ClusterListEmptyState from "@/components/signal/clusters-section/cluster-list/empty-state";
import { type ClusterNode } from "@/components/signal/clusters-section/utils";
import { getClusterColorById } from "@/lib/clusters/colors";
import { cn } from "@/lib/utils";

import ClusterItem from "./cluster-item";

// Landing copy of components/signal/clusters-section/cluster-list. Exists only
// to thread `pulsingClusterId` down to the row — see ./cluster-item.
interface Props {
  drillDownDepth: number;
  filteredCountByCluster: Map<string, number>;
  visibleClusters: ClusterNode[];
  selectedClusterId: string | null;
  onNavigateToCluster: (clusterId: string) => void;
  /** Total events in the selected range — denominator for the global proportion bars. */
  rangeTotal: number;
  /** Row to pulse when the signal-event pill lands in it. */
  pulsingClusterId?: string | null;
  pulseMs: number;
  /** How many clusters have been discovered so far. The rest are not in the
   *  list yet — they unfold in one at a time as the stage reveals them. */
  revealedCount: number;
  revealMs: number;
  className?: string;
}

export default function ClusterList({
  drillDownDepth,
  filteredCountByCluster,
  visibleClusters,
  selectedClusterId,
  onNavigateToCluster,
  rangeTotal,
  pulsingClusterId,
  pulseMs,
  revealedCount,
  revealMs,
  className,
}: Props) {
  const isEmpty = visibleClusters.length === 0;

  // Sort clusters so empty ones (0 items in selected range) sink to the bottom,
  // THEN take the revealed prefix — so a cluster keeps its slot as the counts
  // climb rather than being re-sorted out from under the reveal.
  const shownClusters = useMemo(
    () =>
      [...visibleClusters]
        .sort((a, b) => {
          const aEmpty = (filteredCountByCluster.get(a.id) ?? 0) > 0 ? 0 : 1;
          const bEmpty = (filteredCountByCluster.get(b.id) ?? 0) > 0 ? 0 : 1;
          return aEmpty - bEmpty;
        })
        .slice(0, revealedCount),
    [visibleClusters, filteredCountByCluster, revealedCount]
  );

  if (isEmpty) {
    return (
      <div className={cn("border-r bg-secondary overflow-hidden min-w-0", className)}>
        <ClusterListEmptyState title={drillDownDepth === 0 ? "No clusters during this period" : "No sub-clusters"} />
      </div>
    );
  }

  return (
    <div className={cn("border-r bg-secondary overflow-y-auto overflow-x-hidden min-w-0", className)}>
      <div className="flex flex-col gap-0.5 py-2 px-2 min-w-0">
        {/* Height, not just opacity — each new cluster pushes the list down as
            it unfolds, so the list visibly grows rather than blinking rows in. */}
        <AnimatePresence>
          {shownClusters.map((cluster) => {
            const iconVariant: IconVariant = cluster.children.length > 0 ? "boxes" : "box";
            return (
              <motion.div
                key={cluster.id}
                className="overflow-hidden shrink-0"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: revealMs / 1000, ease: "easeOut" }}
              >
                <ClusterItem
                  cluster={cluster}
                  iconVariant={iconVariant}
                  color={getClusterColorById(cluster.id)}
                  isSelected={selectedClusterId === cluster.id}
                  filteredCount={filteredCountByCluster.get(cluster.id)}
                  total={rangeTotal}
                  onClick={() => onNavigateToCluster(cluster.id)}
                  pulsing={pulsingClusterId === cluster.id}
                  pulseMs={pulseMs}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
