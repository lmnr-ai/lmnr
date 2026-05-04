"use client";

import { getSignalColor } from "@/components/signals/utils";
import { type TraceSignalClusterNode } from "@/components/traces/trace-view/store/base";

interface Props {
  signalName: string;
  clusterPath: TraceSignalClusterNode[];
}

/**
 * `Signal Name / ● / ● / Leaf Cluster Name`
 *
 * The leaf cluster name is rendered in the foreground color; everything before
 * it (signal name, ancestor circles) is muted.
 */
export default function ClusterBreadcrumb({ signalName, clusterPath }: Props) {
  const leaf = clusterPath[clusterPath.length - 1];
  const ancestors = clusterPath.slice(0, -1);

  return (
    <div className="flex items-center gap-1 min-w-0 text-xs">
      <span className="text-secondary-foreground truncate">{signalName}</span>
      {clusterPath.length > 0 && (
        <>
          <span className="text-secondary-foreground shrink-0">/</span>
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
        </>
      )}
    </div>
  );
}
