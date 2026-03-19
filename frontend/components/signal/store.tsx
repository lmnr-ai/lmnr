"use client";

import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useState } from "react";
import { createStore, useStore } from "zustand";

import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet";
import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { type ClusterStatsDataPoint, type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type Filter } from "@/lib/actions/common/filters.ts";
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
  statsUrl: string | null;
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

export const getCurrentNode = (state: Store, clusterId: string | null): ClusterNode | null => {
  if (!clusterId) return null;
  return findNodeById(state.clusterTree, clusterId);
};

export const getBreadcrumb = (state: Store, clusterId: string | null): ClusterNode[] => {
  if (!clusterId) return [];
  if (clusterId === UNCLUSTERED_ID) return [getUnclusteredVirtualCluster(state)];
  return buildPath(state.clusterTree, clusterId);
};

export const getVisibleClusters = (state: Store, clusterId: string | null): ClusterNode[] => {
  const node = getCurrentNode(state, clusterId);
  if (!node) return state.clusterTree;
  return node.children;
};

export const getIsLeaf = (state: Store, clusterId: string | null): boolean => {
  if (clusterId === UNCLUSTERED_ID) return true;
  const node = getCurrentNode(state, clusterId);
  return node !== null && node.children.length === 0;
};

export const getDrillDownDepth = (state: Store, clusterId: string | null): number =>
  getBreadcrumb(state, clusterId).length;

export const selectUnclusteredCount = (state: Store): number =>
  Math.max(0, state.totalEventCount - state.clusteredEventCount);

export const getFilterClusterIds = (state: Store, clusterId: string | null): string[] => {
  const node = getCurrentNode(state, clusterId);
  if (!node) return [];
  return collectDescendantIds(node);
};

export const getUnclusteredVirtualCluster = (state: Store): ClusterNode => ({
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

export const getChartClusters = (state: Store, clusterId: string | null): ClusterNode[] => {
  // Unclustered selected — show only unclustered
  if (clusterId === UNCLUSTERED_ID) {
    return [getUnclusteredVirtualCluster(state)];
  }
  // Leaf selected — show only that leaf
  const node = getCurrentNode(state, clusterId);
  if (node && node.children.length === 0) {
    return [node];
  }
  // Parent or root — show children + unclustered at root
  const visible = getVisibleClusters(state, clusterId);
  const depth = getDrillDownDepth(state, clusterId);
  const unclustered = selectUnclusteredCount(state);
  const clusters: ClusterNode[] = [...visible];
  if (depth === 0 && unclustered > 0) {
    clusters.push(getUnclusteredVirtualCluster(state));
  }
  return clusters;
};

export const getFilteredCountByCluster = (
  state: Store,
  clusterId: string | null,
  hasTimeRange: boolean
): Map<string, number> => {
  const counts = new Map<string, number>();
  if (hasTimeRange) {
    for (const cluster of getVisibleClusters(state, clusterId)) {
      counts.set(cluster.id, 0);
    }
    if (getDrillDownDepth(state, clusterId) === 0) {
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
    fetchClusterStats: async ({ statsUrl, abortSignal }: FetchClusterStatsParams) => {
      if (!statsUrl) {
        set({ clusterStatsData: [], isClusterStatsLoading: false });
        return;
      }

      set({ isClusterStatsLoading: true });

      try {
        const res = await fetch(statsUrl, { signal: abortSignal });
        if (!res.ok) throw new Error("Failed to fetch cluster event counts");
        const data = (await res.json()) as {
          items: ClusterStatsDataPoint[];
          unclusteredCounts: Array<{ timestamp: string; count: number }>;
        };

        const unclusteredData: ClusterStatsDataPoint[] = data.unclusteredCounts.map((item) => ({
          cluster_id: UNCLUSTERED_ID,
          timestamp: item.timestamp,
          count: item.count,
        }));

        set({
          clusterStatsData: [...data.items, ...unclusteredData],
          isClusterStatsLoading: false,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          set({ isClusterStatsLoading: false });
          return;
        }
        set({ clusterStatsData: [], isClusterStatsLoading: false });
      }
    },
  }));

export const SignalContext = createContext<SignalStoreApi | null>(null);

export const useSignalStoreContext = <T,>(selector: (state: Store) => T, equalityFn?: (a: T, b: T) => boolean): T => {
  const store = useContext(SignalContext);
  if (!store) throw new Error("Missing SignalContext.Provider in the tree");
  return useStore(store, selector, equalityFn);
};

export const SignalStoreProvider = ({ children, ...props }: PropsWithChildren<EventsProps>) => {
  const [storeState] = useState(() => createSignalStore(props));

  return <SignalContext.Provider value={storeState}>{children}</SignalContext.Provider>;
};
