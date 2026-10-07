"use client";

import { TooltipProvider } from "@/components/ui/tooltip";

import ClustersSectionContent from "./clusters-section-content";
import { ClusterFocusStoreProvider } from "./focus-store";

interface Props {
  className?: string;
}

// Thin: it mounts the focus store so hover state sits BELOW this boundary, where
// only the bands that care about it subscribe.
export default function ClustersSection({ className }: Props) {
  return (
    <TooltipProvider delayDuration={200}>
      <ClusterFocusStoreProvider>
        <ClustersSectionContent className={className} />
      </ClusterFocusStoreProvider>
    </TooltipProvider>
  );
}
