"use client";

import { useCallback } from "react";
import { shallow } from "zustand/shallow";

import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { getBreadcrumb, useSignalStoreContext } from "@/components/signal/store.tsx";

import ClusterBreadcrumb from "./cluster-breadcrumb";

export default function ClusterBreadcrumbs() {
  const [clusterId, setClusterId] = useClusterId();

  const breadcrumb = useSignalStoreContext((state) => getBreadcrumb(state, clusterId), shallow);

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

  // No loading branch: an unresolved tree gives an empty breadcrumb, which is
  // already the root on its own. A separate loading markup only drifts from the
  // real trail's label and type scale.
  return (
    <ClusterBreadcrumb
      breadcrumb={breadcrumb}
      selectedClusterId={clusterId}
      onNavigateToBreadcrumb={navigateToBreadcrumb}
    />
  );
}
