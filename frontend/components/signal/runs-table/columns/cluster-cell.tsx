"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

import ClusterIcon from "@/components/signal/clusters-section/cluster-list/cluster-icon";
import { signalClusterHref } from "@/components/signal/hooks/signal-tab-search";
import { type SignalRunCluster } from "@/lib/actions/signal-runs/types";
import { getClusterColorById } from "@/lib/clusters/colors";
import { track } from "@/lib/posthog";

// Named leaf clusters this run's event belongs to; empty renders "-" since clustering is fire-and-forget.
export const ClusterCell = ({ clusters }: { clusters: SignalRunCluster[] }) => {
  const pathName = usePathname();
  const searchParams = useSearchParams();

  if (clusters.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const search = searchParams.toString();

  return (
    <div className="flex items-center gap-3 min-w-0 overflow-hidden">
      {clusters.map((cluster) => (
        <Link
          title={cluster.name}
          key={cluster.id}
          href={signalClusterHref(pathName, search, cluster.id)}
          className="flex items-center gap-1.5 min-w-0 hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            track("signals", "cluster_clicked", { clusterId: cluster.id });
          }}
          onAuxClick={(e) => e.stopPropagation()}
        >
          <ClusterIcon iconVariant="box" color={getClusterColorById(cluster.id)} />
          <span className="text-xs truncate">{cluster.name}</span>
        </Link>
      ))}
    </div>
  );
};
