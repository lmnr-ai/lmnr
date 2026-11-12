"use client";

import { Box } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useSyncExternalStore } from "react";
import { useDefaultLayout } from "react-resizable-panels";

import ClusterDetail from "@/components/signal-clusters/cluster-detail";
import EventsPage from "@/components/signal-clusters/cluster-detail/events-page";
import FrequencyChart from "@/components/signal-clusters/cluster-detail/frequency-chart";
import ClusterList from "@/components/signal-clusters/cluster-list";
import ClusterListControls, { useClusterView } from "@/components/signal-clusters/cluster-list-controls";
import { type ClusterView, RESOLVED_VIEW, viewClusters } from "@/components/signal-clusters/cluster-views";
import UnclusteredRow from "@/components/signal-clusters/unclustered-row";
import { useClusterRoute } from "@/components/signal-clusters/use-cluster-route";
import { useSignalClusters } from "@/components/signal-clusters/use-signal-clusters";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { browserLayoutStorage, ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { ElevatedSurface } from "@/components/ui/surface";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters/types";
import { type ClusterResolution } from "@/lib/actions/signal-clusters/types";

const EMPTY_TEXT: Record<ClusterView, string> = {
  active: "Clusters appear once this signal has produced enough similar events to group.",
  resolved: "Clusters you mark resolved appear here.",
  archived: "Clusters you archive appear here. They never get new reports.",
};

const NO_RESOLUTIONS: ClusterResolution[] = [];

interface Props {
  projectId: string;
  signalId: string;
  /** Breadcrumb header across the page. */
  header: ReactNode;
  /** Page tabs, atop the cluster list. */
  tabs: ReactNode;
  onOpenTrace: (traceId: string) => void;
}

const emptySubscribe = () => () => {};
const getClientSnapshot = () => true;
const getServerSnapshot = () => false;

/** A signal's L1 clusters. A report is always open; the first cluster when none is picked. */
export default function SignalClusters({ projectId, signalId, header, tabs, onOpenTrace }: Props) {
  const [clusterId, selectCluster] = useClusterRoute();
  const [urlView, setView] = useClusterView();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({
    id: "signal-clusters-layout",
    storage: browserLayoutStorage,
  });
  // The saved split is only known in the browser; mounting the group there keeps it from jumping after hydration.
  const isClient = useSyncExternalStore(emptySubscribe, getClientSnapshot, getServerSnapshot);
  const resolvable = useSignalStoreContext((state) => state.signal.resolvingEnabled);
  const view = !resolvable && urlView === RESOLVED_VIEW ? "active" : urlView;
  const { data, isLoading, markViewed, setResolved, setArchived } = useSignalClusters(projectId, signalId);

  // With resolving off, past resolutions vanish too: every cluster reads as open, with no resolve history.
  const items = useMemo(
    () =>
      resolvable
        ? (data?.items ?? [])
        : (data?.items ?? []).map((i) => ({ ...i, status: "open" as const, resolutions: [] })),
    [data, resolvable]
  );
  const visible = useMemo(() => viewClusters(items, view), [items, view]);
  const counts = useMemo(
    () =>
      data
        ? {
            active: viewClusters(items, "active").length,
            resolved: viewClusters(items, "resolved").length,
            archived: viewClusters(items, "archived").length,
          }
        : undefined,
    [data, items]
  );
  const unclustered = data?.unclustered ?? null;
  // The cluster in the URL stays open while an archive or resolve moves it to another view, so the selection
  // doesn't jump to (and mark read) a different cluster, or to the unclustered events.
  const routed = items.find((i) => i.id === clusterId) ?? null;
  // Unclustered events are never resolved or archived, so only an empty Active list falls back to them.
  const showUnclustered =
    !!unclustered && (clusterId === UNCLUSTERED_ID || (!routed && view === "active" && visible.length === 0));
  const selected = showUnclustered ? null : (routed ?? visible[0] ?? null);
  const selectedId = showUnclustered ? UNCLUSTERED_ID : (selected?.id ?? null);

  // Pin the default pick in the URL, or a re-sort (e.g. resolving moves it down) would swap the open report.
  useEffect(() => {
    if (!clusterId && selectedId) selectCluster(selectedId, { replace: true });
  }, [clusterId, selectedId, selectCluster]);

  // Opening a report reads it, including the default one nobody clicked.
  useEffect(() => {
    if (selectedId && selectedId !== UNCLUSTERED_ID) void markViewed(selectedId);
  }, [selectedId, markViewed]);

  if (!isClient) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden">
        {header}
        <div className="flex-1" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {header}
      <ResizablePanelGroup
        id="signal-clusters-panels"
        orientation="horizontal"
        defaultLayout={defaultLayout}
        onLayoutChanged={onLayoutChanged}
        className="flex-1 overflow-hidden pr-3 pb-3"
      >
        <ResizablePanel
          id="list"
          defaultSize="28.57%"
          minSize={260}
          maxSize={600}
          className="flex flex-col overflow-hidden"
        >
          <div className="flex-none px-4 pt-[11px]">{tabs}</div>
          <h2 className="flex-none px-4 pt-4 text-base font-medium">Clusters</h2>
          {unclustered && (
            <div className="flex flex-none flex-col px-4 pt-2">
              <UnclusteredRow
                unclustered={unclustered}
                selected={selectedId === UNCLUSTERED_ID}
                onSelect={selectCluster}
              />
            </div>
          )}
          <div className="flex h-12 flex-none items-center px-4">
            <ClusterListControls counts={counts} />
          </div>
          {isLoading ? (
            <div className="flex flex-col gap-1 px-4 py-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : (
            <ClusterList clusters={visible} selectedId={selectedId} onSelect={selectCluster} />
          )}
        </ResizablePanel>
        {/* No line: the card's edge marks the split, and this gap stays draggable. */}
        <ResizableHandle className="w-3 bg-transparent" />
        <ResizablePanel id="report" className="flex flex-col overflow-hidden">
          <ElevatedSurface className="flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-(--color-border-200)">
            {showUnclustered ? (
              <EventsPage
                clusterId={null}
                chart={
                  <div className="flex flex-col gap-4 pt-1">
                    <h2 className="text-base font-medium">Unclustered events</h2>
                    <FrequencyChart
                      projectId={projectId}
                      signalId={signalId}
                      clusterId={null}
                      daily={unclustered.daily}
                      resolutions={NO_RESOLUTIONS}
                      days={data?.days ?? []}
                      color="var(--color-primary)"
                      barOpacity={0.6}
                      showTitle={false}
                    />
                  </div>
                }
              />
            ) : selected && data ? (
              <ClusterDetail
                key={selected.id}
                projectId={projectId}
                signalId={signalId}
                cluster={selected}
                days={data.days}
                onSetResolved={async (resolved) => {
                  // Follow the cluster into the list it moved to, keeping it selected.
                  // Archived clusters stay in Archived, whatever their resolution.
                  if (!(await setResolved(selected.id, resolved)) || selected.archived) return;
                  void setView(resolved ? "resolved" : "active");
                }}
                onSetArchived={async (archived) => {
                  if (!(await setArchived(selected.id, archived))) return;
                  const restored = selected.status === "resolved" ? "resolved" : "active";
                  void setView(archived ? "archived" : restored);
                }}
                onOpenTrace={onOpenTrace}
              />
            ) : (
              !isLoading && (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                  <Box className="size-8 text-muted-foreground" strokeWidth={1.5} />
                  <span className="text-sm font-medium">No clusters to show</span>
                  <span className="max-w-xs text-xs text-muted-foreground">{EMPTY_TEXT[view]}</span>
                </div>
              )
            )}
          </ElevatedSurface>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
