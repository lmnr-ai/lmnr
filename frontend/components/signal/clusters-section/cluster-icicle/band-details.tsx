// What a cluster says about itself. Shared by the strip's tooltip and the
// section's readout, so the two can never disagree.
//
// No width cap on the tooltip — a band squeezed to its floor shows nothing at
// all, so this is the only place its name is legible and it has to read in full.
"use client";

import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { cn } from "@/lib/utils";

import { type ClusterNode } from "../model";

/** A cluster as either readout sees it: the plain node, or the strip's folded
 *  one, which carries its pre-fold children on `all`. */
type DetailedNode = ClusterNode & { all?: ClusterNode[] };

/**
 * How many sub-clusters this cluster really has.
 *
 * `children` on a folded band is the row as DRAWN — the clusters that fit plus a
 * `+N` counter — so counting it reports the width the strip had rather than the
 * shape of the tree, and disagrees with the readout on the same cluster.
 */
const realChildCount = (node: DetailedNode) => (node.all ?? node.children).length;

/**
 * Everything a cluster says about itself besides its name.
 *
 * No level: L1/L2/L3 is our word for how deep the tree is, not something anyone
 * reading the chart needs.
 */
export function clusterFacts(node: DetailedNode, grandTotal: number): string[] {
  const share = grandTotal > 0 ? (node.total / grandTotal) * 100 : 0;
  const childCount = realChildCount(node);
  return [
    `${node.total.toLocaleString()} events`,
    share > 0 ? `${share < 1 ? "<1" : Math.round(share)}% of events` : null,
    // A leaf says nothing rather than saying it has nothing: "no sub-clusters" is
    // the absence of a fact, and it read as one more thing to take in.
    childCount > 0 ? `${childCount} sub-cluster${childCount === 1 ? "" : "s"}` : null,
  ].filter((f): f is string => f !== null);
}

/** The same facts, dot-separated. */
export function ClusterFacts({ facts, className }: { facts: string[]; className?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 whitespace-nowrap text-muted-foreground", className)}>
      {facts.map((fact, i) => (
        <span key={fact} className="flex items-center gap-1.5">
          {i > 0 && <span className="opacity-40">·</span>}
          {fact}
        </span>
      ))}
    </div>
  );
}

export default function BandDetails({ node, grandTotal }: { node: DetailedNode; grandTotal: number }) {
  const childCount = realChildCount(node);

  // A grid, so the facts line up with the *name* rather than with the icon: the
  // icon owns the first column and both text rows sit in the second.
  return (
    <div className="grid grid-cols-[auto_1fr] items-center gap-x-1.5 gap-y-1">
      <ClusterIcon
        iconVariant={childCount > 0 ? "boxes" : "box"}
        color={node.color}
        iconClassName={childCount > 0 ? "size-4" : undefined}
      />
      <span className="min-w-0 truncate font-medium">{node.name}</span>
      <ClusterFacts className="col-start-2" facts={clusterFacts(node, grandTotal)} />
    </div>
  );
}
