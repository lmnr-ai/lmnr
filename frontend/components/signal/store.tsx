"use client";

import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useState } from "react";
import { createStore, useStore } from "zustand";

import { calculateOptimalInterval, getTargetBarsForWidth } from "@/components/charts/time-series-chart/utils";
import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";
import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type Filter } from "@/lib/actions/common/filters.ts";
import { type ClusterStatsDataPoint } from "@/lib/actions/events/stats";
import { type Signal } from "@/lib/actions/signals";
import { type EventRow } from "@/lib/events/types";

import { buildPath, buildTree, type ClusterNode, collectDescendantIds, findNodeById } from "./clusters-section/utils";

export type { ClusterStatsDataPoint };

export type SignalState = {
  events?: EventRow[];
  totalCount: number;
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  traceId: string | null;
  spanId: string | null;
  selectedEvent: EventRow | null;
  runsFilters: Filter[];
  jobsFilters: Filter[];
  triggersFilters: Filter[];
  initialTraceViewWidth?: number;
  lastEvent?: {
    id: string;
    timestamp: string;
  };
  // Cluster state
  rawClusters: EventCluster[];
  clusterTree: ClusterNode[];
  totalEventCount: number;
  clusteredEventCount: number;
  isClustersLoading: boolean;
  clusterStatsData: ClusterStatsDataPoint[];
  isClusterStatsLoading: boolean;
};

export type FetchClusterStatsParams = {
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  chartWidth: number | null;
  clusterId: string | null;
  abortSignal?: AbortSignal;
};

export type SignalActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
  setSelectedEvent: (event: EventRow | null) => void;
  fetchEvents: (params: URLSearchParams) => Promise<void>;
  setSignal: (eventDefinition?: SignalState["signal"]) => void;
  setRunsFilters: Dispatch<SetStateAction<Filter[]>>;
  setJobsFilters: Dispatch<SetStateAction<Filter[]>>;
  setTriggersFilters: Dispatch<SetStateAction<Filter[]>>;
  // Cluster actions
  fetchClusters: () => Promise<void>;
  fetchClusterStats: (params: FetchClusterStatsParams) => Promise<void>;
};

export interface EventsProps {
  signal: Signal;
  traceId?: string | null;
  spanId?: string | null;
  lastEvent?: {
    id: string;
    timestamp: string;
  };
  initialTraceViewWidth?: number;
}

export type Store = SignalState & SignalActions;

// --- Selectors ---

export const selectTree = (state: Store): ClusterNode[] => state.clusterTree;

export const selectCurrentNode =
  (clusterId: string | null) =>
  (state: Store): ClusterNode | null => {
    if (!clusterId) return null;
    return findNodeById(selectTree(state), clusterId);
  };

export const selectBreadcrumb =
  (clusterId: string | null) =>
  (state: Store): ClusterNode[] => {
    if (!clusterId) return [];
    if (clusterId === UNCLUSTERED_ID) return [selectUnclusteredVirtualCluster(state)];
    return buildPath(selectTree(state), clusterId);
  };

export const selectVisibleClusters =
  (clusterId: string | null) =>
  (state: Store): ClusterNode[] => {
    const node = selectCurrentNode(clusterId)(state);
    if (!node) return selectTree(state);
    return node.children;
  };

export const selectIsLeaf =
  (clusterId: string | null) =>
  (state: Store): boolean => {
    if (clusterId === UNCLUSTERED_ID) return true;
    const node = selectCurrentNode(clusterId)(state);
    return node !== null && node.children.length === 0;
  };

export const selectDrillDownDepth =
  (clusterId: string | null) =>
  (state: Store): number =>
    selectBreadcrumb(clusterId)(state).length;

export const selectUnclusteredCount = (state: Store): number =>
  Math.max(0, state.totalEventCount - state.clusteredEventCount);

export const selectFilterClusterIds =
  (clusterId: string | null) =>
  (state: Store): string[] => {
    const node = selectCurrentNode(clusterId)(state);
    if (!node) return [];
    return collectDescendantIds(node);
  };

export const selectIsUnclusteredFilter =
  (clusterId: string | null) =>
  (_state: Store): boolean =>
    clusterId === UNCLUSTERED_ID;

export const selectUnclusteredVirtualCluster = (state: Store): ClusterNode => ({
  id: UNCLUSTERED_ID,
  name: "Unclustered Events",
  parentId: null,
  level: 0,
  numChildrenClusters: 0,
  numEvents: selectUnclusteredCount(state),
  createdAt: "",
  updatedAt: "",
  children: [],
});

export const selectChartClusters =
  (clusterId: string | null) =>
  (state: Store): ClusterNode[] => {
    // Unclustered selected — show only unclustered
    if (clusterId === UNCLUSTERED_ID) {
      return [selectUnclusteredVirtualCluster(state)];
    }
    // Leaf selected — show only that leaf
    const node = selectCurrentNode(clusterId)(state);
    if (node && node.children.length === 0) {
      return [node];
    }
    // Parent or root — show children + unclustered at root
    const visible = selectVisibleClusters(clusterId)(state);
    const depth = selectDrillDownDepth(clusterId)(state);
    const unclustered = selectUnclusteredCount(state);
    const clusters: ClusterNode[] = [...visible];
    if (depth === 0 && unclustered > 0) {
      clusters.push(selectUnclusteredVirtualCluster(state));
    }
    return clusters;
  };

export const selectFilteredCountByCluster =
  (clusterId: string | null, hasTimeRange: boolean) =>
  (state: Store): Map<string, number> => {
    const counts = new Map<string, number>();
    if (hasTimeRange) {
      for (const cluster of selectVisibleClusters(clusterId)(state)) {
        counts.set(cluster.id, 0);
      }
      if (selectDrillDownDepth(clusterId)(state) === 0) {
        counts.set(UNCLUSTERED_ID, 0);
      }
    }
    for (const row of state.clusterStatsData) {
      counts.set(row.cluster_id, (counts.get(row.cluster_id) ?? 0) + row.count);
    }
    return counts;
  };

// --- Store ---

export type SignalStoreApi = ReturnType<typeof createSignalStore>;

export const createSignalStore = (initProps: EventsProps) =>
  createStore<Store>()((set, get) => ({
    totalCount: 0,
    traceId: initProps.traceId || null,
    spanId: initProps.spanId || null,
    selectedEvent: null,
    runsFilters: [],
    jobsFilters: [],
    triggersFilters: [],
    lastEvent: initProps.lastEvent,
    initialTraceViewWidth: initProps.initialTraceViewWidth,
    // Cluster state
    rawClusters: [],
    clusterTree: [],
    totalEventCount: 0,
    clusteredEventCount: 0,
    isClustersLoading: true,
    clusterStatsData: [],
    isClusterStatsLoading: false,
    signal: {
      ...initProps.signal,
      prompt: initProps.signal.prompt,
      schemaFields: jsonSchemaToSchemaFields(initProps.signal.structuredOutput as Record<string, unknown>),
    },
    setSignal: (signal) => set({ signal }),
    setTraceId: (traceId) => set({ traceId }),
    setSpanId: (spanId) => set({ spanId }),
    setSelectedEvent: (event) => set({ selectedEvent: event }),
    setRunsFilters: (filters) =>
      set((state) => ({
        runsFilters: typeof filters === "function" ? filters(state.runsFilters) : filters,
      })),
    setJobsFilters: (filters) =>
      set((state) => ({
        jobsFilters: typeof filters === "function" ? filters(state.jobsFilters) : filters,
      })),
    setTriggersFilters: (filters) =>
      set((state) => ({
        triggersFilters: typeof filters === "function" ? filters(state.triggersFilters) : filters,
      })),
    fetchEvents: async (params: URLSearchParams) => {
      const { signal } = get();

      set({ events: undefined });

      try {
        const response = await fetch(
          `/api/projects/${signal.projectId}/signals/${signal.id}/events?${params.toString()}`
        );
        if (!response.ok) throw new Error("Failed to fetch events");
        const data: { items: EventRow[]; count: number } = await response.json();
        set({
          events: data.items,
          totalCount: data.count,
        });
      } catch (error) {
        set({ events: [], totalCount: 0 });
        console.error("Error fetching events:", error);
      }
    },
    // Cluster actions
    fetchClusters: async () => {
      const { signal } = get();
      set({ isClustersLoading: true });
      try {
        const res = await fetch(`/api/projects/${signal.projectId}/signals/${signal.id}/events/clusters`);
        if (!res.ok) {
          const text = (await res.json()) as { error: string };
          throw new Error(text.error);
        }
        const data = (await res.json()) as {
          items: EventCluster[];
          totalEventCount: number;
          clusteredEventCount: number;
        };
        set({
          rawClusters: data.items,
          clusterTree: buildTree(data.items),
          totalEventCount: data.totalEventCount,
          clusteredEventCount: data.clusteredEventCount,
        });
      } catch (err) {
        console.error("Failed to load clusters:", err);
      } finally {
        set({ isClustersLoading: false });
      }
    },
    fetchClusterStats: async ({
      pastHours,
      startDate,
      endDate,
      chartWidth,
      clusterId,
      abortSignal,
    }: FetchClusterStatsParams) => {
      if (!pastHours && !startDate) {
        set({ clusterStatsData: [] });
        return;
      }

      const state = get();
      const visibleClusters = selectVisibleClusters(clusterId)(state);
      const drillDownDepth = selectDrillDownDepth(clusterId)(state);
      const { signal } = state;

      const width = chartWidth ?? 800;
      const targetBars = getTargetBarsForWidth(width);
      let range: { start: Date; end: Date } | null = null;
      if (pastHours && pastHours !== "all") {
        const hours = parseInt(pastHours);
        if (!isNaN(hours)) {
          range = { start: new Date(Date.now() - hours * 60 * 60 * 1000), end: new Date() };
        }
      } else if (startDate && endDate) {
        range = { start: new Date(startDate), end: new Date(endDate) };
      }
      const interval = range
        ? calculateOptimalInterval(range.start, range.end, targetBars)
        : { value: 1, unit: "hour" as const };

      set({ isClusterStatsLoading: true });

      const fetches: Promise<ClusterStatsDataPoint[]>[] = [];

      if (visibleClusters.length > 0) {
        const urlParams = new URLSearchParams();
        visibleClusters.forEach((c) => urlParams.append("clusterId", c.id));
        if (pastHours) urlParams.set("pastHours", pastHours);
        if (startDate) urlParams.set("startDate", startDate);
        if (endDate) urlParams.set("endDate", endDate);
        urlParams.set("intervalValue", interval.value.toString());
        urlParams.set("intervalUnit", interval.unit);

        fetches.push(
          fetch(
            `/api/projects/${signal.projectId}/signals/${signal.id}/events/clusters/stats?${urlParams.toString()}`,
            { signal: abortSignal }
          )
            .then((res) => {
              if (!res.ok) throw new Error("Failed to fetch cluster stats");
              return res.json();
            })
            .then((data: { items: ClusterStatsDataPoint[] }) => data.items)
            .catch((err) => {
              if (err instanceof DOMException && err.name === "AbortError") throw err;
              return [] as ClusterStatsDataPoint[];
            })
        );
      } else {
        fetches.push(Promise.resolve([]));
      }

      if (drillDownDepth === 0) {
        const unclusteredParams = new URLSearchParams();
        if (pastHours) unclusteredParams.set("pastHours", pastHours);
        if (startDate) unclusteredParams.set("startDate", startDate);
        if (endDate) unclusteredParams.set("endDate", endDate);
        unclusteredParams.set("intervalValue", interval.value.toString());
        unclusteredParams.set("intervalUnit", interval.unit);
        unclusteredParams.set("unclustered", "true");

        fetches.push(
          fetch(`/api/projects/${signal.projectId}/signals/${signal.id}/events/stats?${unclusteredParams.toString()}`, {
            signal: abortSignal,
          })
            .then((res) => {
              if (!res.ok) throw new Error("Failed to fetch unclustered stats");
              return res.json();
            })
            .then((data: { items: Array<{ timestamp: string; count: number }> }) =>
              data.items.map((item) => ({
                cluster_id: UNCLUSTERED_ID,
                timestamp: item.timestamp,
                count: item.count,
              }))
            )
            .catch((err) => {
              if (err instanceof DOMException && err.name === "AbortError") throw err;
              return [] as ClusterStatsDataPoint[];
            })
        );
      } else {
        fetches.push(Promise.resolve([]));
      }

      try {
        const [clusterStats, unclusteredStats] = await Promise.all(fetches);
        set({
          clusterStatsData: [...clusterStats, ...unclusteredStats],
          isClusterStatsLoading: false,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        throw err;
      }
    },
  }));

export const SignalContext = createContext<SignalStoreApi | null>(null);

export const useSignalStoreContext = <T,>(selector: (state: Store) => T): T => {
  const store = useContext(SignalContext);
  if (!store) throw new Error("Missing SignalContext.Provider in the tree");
  return useStore(store, selector);
};

export const SignalStoreProvider = ({ children, ...props }: PropsWithChildren<EventsProps>) => {
  const [storeState] = useState(() => createSignalStore(props));

  return <SignalContext.Provider value={storeState}>{children}</SignalContext.Provider>;
};
