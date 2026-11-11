"use client";

import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { type SignalCluster } from "@/lib/actions/signal-clusters/types";
import { getClusterColorById } from "@/lib/clusters/colors";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Props {
  /** Already in display order. */
  clusters: SignalCluster[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// Same row feel as the side nav: rounded, gapped, overlay hover and selection.
export const ROW = "flex flex-col gap-0.5 rounded-md px-3 py-1.5 text-left text-sm hover:overlay-hover";

export default function ClusterList({ clusters, selectedId, onSelect }: Props) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-4 py-0">
        {clusters.map((cluster) => (
          <button
            key={cluster.id}
            onClick={() => onSelect(cluster.id)}
            className={cn(ROW, selectedId === cluster.id && "overlay-selected")}
          >
            <span
              className={cn(
                "flex min-w-0 items-center gap-2",
                cluster.unread ? "font-semibold" : "text-secondary-foreground"
              )}
            >
              <ClusterIcon
                iconVariant="box"
                color={getClusterColorById(cluster.id)}
                isSelected={selectedId === cluster.id}
                isViewed={!cluster.unread}
              />
              <span className="flex-1 truncate">{cluster.name}</span>
              {cluster.unread && <span aria-label="Unread" className="size-1.5 flex-none rounded-full bg-primary" />}
            </span>
            <span className="flex justify-between gap-2 pl-6 text-xs text-muted-foreground">
              <span>
                {cluster.total.toLocaleString()} {cluster.total === 1 ? "event" : "events"}
              </span>
              <span>{formatRelativeTime(cluster.lastSeen)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
