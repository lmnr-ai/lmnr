"use client";

import { type ReactNode, useMemo } from "react";

import EventsTable from "@/components/signal/events-table";
import { CLUSTER_WINDOW_DAYS } from "@/lib/actions/signal-clusters/types";

interface Props {
  /** null shows events in no cluster. */
  clusterId: string | null;
  /** Above the table, e.g. the cluster's frequency chart. */
  chart?: ReactNode;
}

/** A cluster's rows of the signal events table, filling the column. */
export default function EventsPage({ clusterId, chart }: Props) {
  const clusterIds = useMemo(() => (clusterId ? [clusterId] : undefined), [clusterId]);
  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1200px] flex-1 flex-col overflow-hidden pt-2">
      {chart && <div className="flex-none px-4 pb-4">{chart}</div>}
      <EventsTable clusterIds={clusterIds} unclustered={!clusterId} defaultPastHours={CLUSTER_WINDOW_DAYS * 24} />
    </div>
  );
}
