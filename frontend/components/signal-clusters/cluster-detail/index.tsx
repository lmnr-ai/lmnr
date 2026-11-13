import { Archive, ArchiveRestore, CheckCircle2, RotateCcw } from "lucide-react";

import { CreateEvalsButton } from "@/components/agent";
import ClusterTabs, { useClusterTab } from "@/components/signal-clusters/cluster-detail/cluster-tabs";
import { openResolutionAt } from "@/components/signal-clusters/cluster-detail/dates";
import EventsPage from "@/components/signal-clusters/cluster-detail/events-page";
import FrequencyChart from "@/components/signal-clusters/cluster-detail/frequency-chart";
import ReportPage from "@/components/signal-clusters/cluster-detail/report-page";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button";
import { type SignalCluster } from "@/lib/actions/signal-clusters/types";
import { getClusterColorById } from "@/lib/clusters/colors";

interface Props {
  projectId: string;
  signalId: string;
  cluster: SignalCluster;
  days: string[];
  onSetResolved: (resolved: boolean) => void;
  onSetArchived: (archived: boolean) => void;
  onOpenTrace: (traceId: string) => void;
}

/** The selected cluster: Report | Events with the archive and resolve actions, then that page. */
export default function ClusterDetail({
  projectId,
  signalId,
  cluster,
  days,
  onSetResolved,
  onSetArchived,
  onOpenTrace,
}: Props) {
  const [tab] = useClusterTab();
  // Without reports there is nothing for a Report tab to hold, so the cluster opens straight to its events.
  const reportsEnabled = useSignalStoreContext((state) => state.signal.reportsEnabled);
  const resolvedAt = openResolutionAt(cluster.resolutions);
  const color = getClusterColorById(cluster.id);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex h-12 flex-none items-center justify-between gap-2 px-4">
        {reportsEnabled ? <ClusterTabs /> : <span />}
        <div className="flex items-center gap-2">
          <CreateEvalsButton clusterName={cluster.name} />
          <Button
            variant="ghost"
            onClick={() => onSetArchived(!cluster.archived)}
            className="gap-1.5 bg-emphasis-2 hover:overlay-hover active:overlay-selected"
          >
            {cluster.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            {cluster.archived ? "Unarchive" : "Archive"}
          </Button>
          <Button
            variant={resolvedAt ? "outline" : "default"}
            onClick={() => onSetResolved(!resolvedAt)}
            className="gap-1.5"
          >
            {resolvedAt ? <RotateCcw className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}
            {resolvedAt ? "Reopen" : "Resolve"}
          </Button>
        </div>
      </div>
      {reportsEnabled && tab === "report" ? (
        <ReportPage
          projectId={projectId}
          signalId={signalId}
          cluster={cluster}
          days={days}
          color={color}
          onOpenTrace={onOpenTrace}
        />
      ) : (
        <EventsPage
          clusterId={cluster.id}
          chart={
            <FrequencyChart
              projectId={projectId}
              signalId={signalId}
              clusterId={cluster.id}
              daily={cluster.daily}
              resolutions={cluster.resolutions}
              days={days}
              color={color}
              showTitle={false}
            />
          }
        />
      )}
    </div>
  );
}
