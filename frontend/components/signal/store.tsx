"use client";

import { createContext, type Dispatch, type PropsWithChildren, type SetStateAction, useContext, useState } from "react";
import { createStore, useStore } from "zustand";

import { type ManageSignalForm } from "@/components/signals/manage-signal-sheet.tsx";
import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type Filter } from "@/lib/actions/common/filters.ts";
import { type ClusterStatsDataPoint } from "@/lib/actions/events/stats";
import { type Signal } from "@/lib/actions/signals";
import { type EventRow } from "@/lib/events/types";

import { buildPath, buildTree, type ClusterNode, collectDescendantIds, findNodeById } from "./clusters-table/utils";

export type { ClusterStatsDataPoint };

export type SignalState = {
  events?: EventRow[];
  totalCount: number;
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  traceId: string | null;
  spanId: string | null;
  selectedEvent: EventRow | null;
  chartContainerWidth: number | null;
  runsFilters: Filter[];
  jobsFilters: Filter[];
  triggersFilters: Filter[];
  initialTraceViewWidth?: number;
  lastEvent?: {
    id: string;
    timestamp: string;
  };
  // Cluster state
  selectedClusterId: string | null;
  rawClusters: EventCluster[];
  totalEventCount: number;
  clusteredEventCount: number;
  isClustersLoading: boolean;
  clusterStatsData: ClusterStatsDataPoint[];
  isClusterStatsLoading: boolean;
};

export type SignalActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
  setSelectedEvent: (event: EventRow | null) => void;
  fetchEvents: (params: URLSearchParams) => Promise<void>;
  setSignal: (eventDefinition?: SignalState["signal"]) => void;
  setChartContainerWidth: (width: number) => void;
  setRunsFilters: Dispatch<SetStateAction<Filter[]>>;
  setJobsFilters: Dispatch<SetStateAction<Filter[]>>;
  setTriggersFilters: Dispatch<SetStateAction<Filter[]>>;
  // Cluster actions
  setSelectedClusterId: (id: string | null) => void;
  fetchClusters: () => Promise<void>;
  setClusterStatsData: (data: ClusterStatsDataPoint[]) => void;
  setIsClusterStatsLoading: (loading: boolean) => void;
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

export const selectTree = (state: Store): ClusterNode[] => buildTree(state.rawClusters);

export const selectCurrentNode = (state: Store): ClusterNode | null => {
  if (!state.selectedClusterId) return null;
  return findNodeById(selectTree(state), state.selectedClusterId);
};

export const selectBreadcrumb = (state: Store): ClusterNode[] => {
  if (!state.selectedClusterId) return [];
  return buildPath(selectTree(state), state.selectedClusterId);
};

export const selectVisibleClusters = (state: Store): ClusterNode[] => {
  const node = selectCurrentNode(state);
  if (!node) return selectTree(state);
  return node.children;
};

export const selectIsLeaf = (state: Store): boolean => {
  const node = selectCurrentNode(state);
  return node !== null && node.children.length === 0;
};

export const selectDrillDownDepth = (state: Store): number => selectBreadcrumb(state).length;

export const selectUnclusteredCount = (state: Store): number => Math.max(0, state.totalEventCount - state.clusteredEventCount);

export const selectFilterClusterIds = (state: Store): string[] => {
  const node = selectCurrentNode(state);
  if (!node) return [];
  return collectDescendantIds(node);
};

export const selectIsUnclusteredFilter = (state: Store): boolean => state.selectedClusterId === UNCLUSTERED_ID;

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
    chartContainerWidth: null,
    // Cluster state
    selectedClusterId: null,
    rawClusters: [],
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
    setChartContainerWidth: (width: number) => set({ chartContainerWidth: width }),
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
    setSelectedClusterId: (id: string | null) => set({ selectedClusterId: id }),
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
          totalEventCount: data.totalEventCount,
          clusteredEventCount: data.clusteredEventCount,
        });
      } catch (err) {
        console.error("Failed to load clusters:", err);
      } finally {
        set({ isClustersLoading: false });
      }
    },
    setClusterStatsData: (data: ClusterStatsDataPoint[]) => set({ clusterStatsData: data }),
    setIsClusterStatsLoading: (loading: boolean) => set({ isClusterStatsLoading: loading }),
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
