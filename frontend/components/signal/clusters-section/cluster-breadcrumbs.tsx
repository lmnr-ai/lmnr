"use client";

import { useCallback, useMemo } from "react";

import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { selectBreadcrumb, selectIsLeaf, useSignalStoreContext } from "@/components/signal/store.tsx";

import ClusterBreadcrumb from "./cluster-breadcrumb";

export default function ClusterBreadcrumbs() {
  const [clusterId, setClusterId] = useClusterId();

  const isLeafSelector = useMemo(() => selectIsLeaf(clusterId), [clusterId]);
  const isLeaf = useSignalStoreContext(isLeafSelector);

  const breadcrumbSelector = useMemo(() => selectBreadcrumb(clusterId), [clusterId]);
  const breadcrumb = useSignalStoreContext(breadcrumbSelector);

  const isClustersLoading = useSignalStoreContext((state) => state.isClustersLoading);

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (index < 0) {
        setClusterId(null);
      } else {
        setClusterId(breadcrumb[index].id);
      }
    },
    [setClusterId, breadcrumb]
  );

  if (isClustersLoading) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <span className="font-semibold text-secondary-foreground">All Events</span>
      </div>
    );
  }

  return (
    <ClusterBreadcrumb
      breadcrumb={breadcrumb}
      selectedClusterId={clusterId}
      onNavigateToBreadcrumb={navigateToBreadcrumb}
    />
  );
}
