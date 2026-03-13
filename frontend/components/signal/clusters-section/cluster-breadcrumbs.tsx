"use client";

import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { getBreadcrumb, useSignalStoreContext } from "@/components/signal/store.tsx";

import ClusterBreadcrumb from "./cluster-breadcrumb";

export default function ClusterBreadcrumbs() {
  const [clusterId, setClusterId] = useClusterId();

  const breadcrumb = useSignalStoreContext((state) => getBreadcrumb(state, clusterId), shallow);

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
