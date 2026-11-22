"use client";

import { ROW } from "@/components/signal-clusters/cluster-list";
import ClusterIcon from "@/components/signal/clusters-section/cluster-icon";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters/types";
import { type UnclusteredEvents } from "@/lib/actions/signal-clusters/types";
import { UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { cn, formatRelativeTime } from "@/lib/utils";

interface Props {
  unclustered: UnclusteredEvents;
  selected: boolean;
  onSelect: (id: string) => void;
}

/** The signal's events no cluster holds, pinned above the cluster filters. */
export default function UnclusteredRow({ unclustered, selected, onSelect }: Props) {
  return (
    <button onClick={() => onSelect(UNCLUSTERED_ID)} className={cn(ROW, "flex-none", selected && "overlay-selected")}>
      <span className="flex min-w-0 items-center gap-2 text-secondary-foreground">
        <ClusterIcon iconVariant="circle-dashed" color={UNCLUSTERED_COLOR} />
        <span className="truncate">Unclustered events</span>
      </span>
      <span className="flex justify-between gap-2 pl-6 text-xs text-muted-foreground">
        <span>
          {unclustered.total.toLocaleString()} {unclustered.total === 1 ? "event" : "events"}
        </span>
        <span>{formatRelativeTime(unclustered.lastSeen)}</span>
      </span>
    </button>
  );
}
