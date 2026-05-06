"use client";

import { getSignalColor } from "@/components/signals/utils";
import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";

interface Props {
  clusterPath: TraceSignalClusterNode[];
}

/**
 * `● / ● / ● Leaf Cluster Name`
 *
 * Each ancestor is shown as a colored circle (hashed by id); the leaf cluster
 * also gets its circle plus its name. No signal name — that's on the tab.
 */
export default function ClusterBreadcrumb({ clusterPath }: Props) {
  if (clusterPath.length === 0) return null;
  const leaf = clusterPath[clusterPath.length - 1];
  const ancestors = clusterPath.slice(0, -1);

  return (
    <div className="flex items-center gap-1 min-w-0 text-xs">
      {ancestors.map((node) => (
        <span key={node.id} className="flex items-center gap-1 shrink-0">
          <span className="size-2 rounded-full" style={{ backgroundColor: getSignalColor(node.id) }} aria-hidden />
          <span className="text-secondary-foreground">/</span>
        </span>
      ))}
      {leaf && (
        <>
          <span
            className="size-2 rounded-full shrink-0"
            style={{ backgroundColor: getSignalColor(leaf.id) }}
            aria-hidden
          />
          <span className="text-foreground truncate">{leaf.name}</span>
        </>
      )}
    </div>
  );
}
