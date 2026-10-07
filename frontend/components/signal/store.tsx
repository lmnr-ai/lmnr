"use client";

import { createContext, type PropsWithChildren, useContext, useState } from "react";
import { createStore } from "zustand";
import { useStoreWithEqualityFn } from "zustand/traditional";

import { type ManageSignalForm } from "@/components/signals/create-signal-drawer/types";
import { jsonSchemaToSchemaFields } from "@/components/signals/utils";
import { type EventCluster, UNCLUSTERED_ID } from "@/lib/actions/clusters/types";
import { type Trigger } from "@/lib/actions/signal-triggers";
import { type Signal } from "@/lib/actions/signals";

import { buildPath, buildTree, type ClusterNode, collectDescendantIds, findNodeById } from "./clusters-section/utils";

export type SignalState = {
  signal: Omit<ManageSignalForm, "id"> & { id: string };
  traceId: string | null;
  spanId: string | null;
  // Cluster state
  rawClusters: EventCluster[];
  clusterTree: ClusterNode[];
  totalEventCount: number;
  clusteredEventCount: number;
  clustersRangeKey: string | null;
};

export type FetchClustersParams = {
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

export type SignalActions = {
  setTraceId: (traceId: string | null) => void;
  setSpanId: (spanId: string | null) => void;
  setSignal: (eventDefinition?: SignalState["signal"]) => void;
  // Cluster actions
  setClusters: (data: {
    items: EventCluster[];
    totalEventCount: number;
    clusteredEventCount: number;
    rangeKey: string;
  }) => void;
};

export interface EventsProps {
  signal: Signal & { triggers?: Trigger[] };
  traceId?: string | null;
  spanId?: string | null;
}

export type Store = SignalState & SignalActions;

// --- Selectors ---

// Only the three selectors read by components are exported; the rest are the
// pieces those three are built out of.
const getCurrentNode = (state: Store, clusterId: string | null): ClusterNode | null => {
  if (!clusterId) return null;
  return findNodeById(state.clusterTree, clusterId);
};

export const getBreadcrumbFromData = (
  clusterTree: ClusterNode[],
  unclusteredCount: number,
  clusterId: string | null
): ClusterNode[] => {
  if (!clusterId) return [];
  if (clusterId === UNCLUSTERED_ID) return [getUnclusteredVirtualCluster(unclusteredCount)];
  return buildPath(clusterTree, clusterId);
};

export const getBreadcrumb = (state: Store, clusterId: string | null): ClusterNode[] =>
  getBreadcrumbFromData(state.clusterTree, selectUnclusteredCount(state), clusterId);

// Exported for the readout, which offers the unclustered bucket as a pick and so
// has to name its size. Not derivable from the cluster tree — the tree only knows
// about events that landed in a cluster.
export const selectUnclusteredCount = (state: Store): number =>
  Math.max(0, state.totalEventCount - state.clusteredEventCount);

export const getFilterClusterIds = (state: Store, clusterId: string | null): string[] => {
  const node = getCurrentNode(state, clusterId);
  if (!node) return [];
  return collectDescendantIds(node);
};

const getUnclusteredVirtualCluster = (unclusteredCount: number): ClusterNode => ({
  id: UNCLUSTERED_ID,
  name: "Unclustered Events",
  parentId: null,
  level: 0,
  numChildrenClusters: 0,
  numEvents: unclusteredCount,
  createdAt: "",
  updatedAt: "",
  children: [],
});

export const getChartClustersFromData = (
  clusterTree: ClusterNode[],
  totalEventCount: number,
  clusteredEventCount: number,
  clusterId: string | null
): ClusterNode[] => {
  const unclusteredCount = Math.max(0, totalEventCount - clusteredEventCount);
  if (clusterId === UNCLUSTERED_ID) return [getUnclusteredVirtualCluster(unclusteredCount)];

  const node = clusterId ? findNodeById(clusterTree, clusterId) : null;
  if (node && node.children.length === 0) return [node];

  const visible = node?.children ?? clusterTree;
  const depth = clusterId ? buildPath(clusterTree, clusterId).length : 0;
  const clusters: ClusterNode[] = [...visible];
  if (depth === 0 && unclusteredCount > 0) clusters.push(getUnclusteredVirtualCluster(unclusteredCount));
  return clusters;
};

export const getChartClusters = (state: Store, clusterId: string | null): ClusterNode[] =>
  getChartClustersFromData(state.clusterTree, state.totalEventCount, state.clusteredEventCount, clusterId);

// --- Store ---

export type SignalStoreApi = ReturnType<typeof createSignalStore>;

export const createSignalStore = (initProps: EventsProps) =>
  createStore<Store>()((set) => ({
    traceId: initProps.traceId || null,
    spanId: initProps.spanId || null,
    // Cluster state
    rawClusters: [],
    clusterTree: [],
    totalEventCount: 0,
    clusteredEventCount: 0,
    clustersRangeKey: null,
    signal: {
      ...initProps.signal,
      prompt: initProps.signal.prompt,
      schemaFields: jsonSchemaToSchemaFields(initProps.signal.structuredOutput as Record<string, unknown>),
      triggers: (initProps.signal.triggers ?? []).map((t) => ({
        id: t.id,
        conditions: t.conditions ?? [],
        filters: t.filters ?? [],
        mode: t.mode ?? 0,
      })),
    },
    setSignal: (signal) => set({ signal }),
    setTraceId: (traceId) => set({ traceId }),
    setSpanId: (spanId) => set({ spanId }),
    // Cluster actions
    setClusters: ({ items, totalEventCount, clusteredEventCount, rangeKey }) =>
      set({
        rawClusters: items,
        clusterTree: buildTree(items),
        totalEventCount,
        clusteredEventCount,
        clustersRangeKey: rangeKey,
      }),
  }));

export const SignalContext = createContext<SignalStoreApi | null>(null);

export const useSignalStoreContext = <T,>(selector: (state: Store) => T, equalityFn?: (a: T, b: T) => boolean): T => {
  const store = useContext(SignalContext);
  if (!store) throw new Error("Missing SignalContext.Provider in the tree");
  return useStoreWithEqualityFn(store, selector, equalityFn);
};

export const SignalStoreProvider = ({ children, ...props }: PropsWithChildren<EventsProps>) => {
  const [storeState] = useState(() => createSignalStore(props));

  return <SignalContext.Provider value={storeState}>{children}</SignalContext.Provider>;
};
