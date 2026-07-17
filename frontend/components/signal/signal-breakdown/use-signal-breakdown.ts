"use client";

import { useCallback, useEffect, useMemo } from "react";
import useSWR from "swr";
import { shallow } from "zustand/shallow";

import { useTimeSeriesStatsUrl } from "@/components/charts/time-series-chart/use-time-series-stats-url";
import { useClusterId } from "@/components/signal/hooks/use-cluster-id";
import { useEmergingClusterId } from "@/components/signal/hooks/use-emerging-cluster-id";
import { selectTree, selectUnclusteredCount, useSignalStoreContext } from "@/components/signal/store";
import { UNCLUSTERED_ID } from "@/lib/actions/clusters";
import { type AgentBucket, type BreakdownStatsPoint } from "@/lib/actions/signal-breakdown";
import { UNCLUSTERED_COLOR } from "@/lib/clusters/colors";
import { swrFetcher } from "@/lib/utils";

import {
  buildAgentNodes,
  buildEnumNodes,
  buildSeverityNodes,
  clusterNodesToBreakdown,
  rollupAgentStats,
} from "./dimensions";
import { buildTree } from "./tree";
import { type BreakdownDimension, type BreakdownNode } from "./types";

export interface UseSignalBreakdownArgs {
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  containerWidth: number | null;
}

export interface SignalBreakdownData {
  nodes: BreakdownNode[];
  statsData: BreakdownStatsPoint[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  isLoading: boolean;
  isStatsLoading: boolean;
}

/**
 * Produces dimension-agnostic breakdown data for the current `breakdownBy`.
 * Selection is proxied to the URL for clusters and to the store for every other
 * dimension, so the dumb UI never learns which backing store it is driving.
 */
export function useSignalBreakdown({
  pastHours,
  startDate,
  endDate,
  containerWidth,
}: UseSignalBreakdownArgs): SignalBreakdownData {
  const signal = useSignalStoreContext((s) => s.signal);
  const breakdownBy = useSignalStoreContext((s) => s.breakdownBy);
  const isClusters = breakdownBy.kind === "clusters";

  const projectId = signal.projectId;
  const signalId = signal.id;
  const base = `/api/projects/${projectId}/signals/${signalId}/breakdown`;

  // --- Cluster dimension: read the existing store slice, mapped to agnostic. ---
  const clusterTree = useSignalStoreContext(selectTree, shallow);
  const unclusteredCount = useSignalStoreContext(selectUnclusteredCount);
  const clusterStatsData = useSignalStoreContext((s) => s.clusterStatsData);
  const isClustersLoading = useSignalStoreContext((s) => s.isClustersLoading);
  const isClusterStatsLoading = useSignalStoreContext((s) => s.isClusterStatsLoading);
  const [clusterId, setClusterId] = useClusterId();
  const [, setEmergingClusterId] = useEmergingClusterId();

  // --- Non-cluster selection + agent buckets live in the store. ---
  const breakdownSelectedId = useSignalStoreContext((s) => s.breakdownSelectedId);
  const setBreakdownSelectedId = useSignalStoreContext((s) => s.setBreakdownSelectedId);
  const agentBuckets = useSignalStoreContext((s) => s.agentBuckets);
  const setAgentBuckets = useSignalStoreContext((s) => s.setAgentBuckets);

  // Stats URL for the non-cluster dimensions (null when clusters → no fetch).
  const additionalParams = useMemo<Record<string, string>>(() => {
    const p: Record<string, string> = {};
    if (breakdownBy.kind === "clusters") return p;
    p.dimension = breakdownBy.kind;
    if (breakdownBy.kind === "enum") p.field = breakdownBy.field;
    return p;
  }, [breakdownBy]);

  const statsUrl = useTimeSeriesStatsUrl({
    baseUrl: `${base}/stats`,
    chartContainerWidth: containerWidth,
    pastHours,
    startDate,
    endDate,
    additionalParams,
  });

  const { data: statsResp, isLoading: statsLoading } = useSWR<{ items: BreakdownStatsPoint[] }>(
    isClusters ? null : statsUrl,
    swrFetcher
  );

  // Agent buckets (PG tree) — only fetched for the agent dimension.
  const { data: agentResp, isLoading: agentBucketsLoading } = useSWR<{ agents: AgentBucket[] }>(
    breakdownBy.kind === "agent" ? `${base}/agents` : null,
    swrFetcher
  );
  useEffect(() => {
    if (agentResp?.agents) setAgentBuckets(agentResp.agents);
  }, [agentResp, setAgentBuckets]);

  const enumField = breakdownBy.kind === "enum" ? breakdownBy.field : null;
  const schemaField = useMemo(
    () => (enumField ? signal.schemaFields.find((f) => f.name === enumField) : undefined),
    [enumField, signal.schemaFields]
  );

  const nodes = useMemo<BreakdownNode[]>(() => {
    switch (breakdownBy.kind) {
      case "clusters": {
        const mapped = clusterNodesToBreakdown(clusterTree);
        if (unclusteredCount > 0) {
          mapped.push({
            id: UNCLUSTERED_ID,
            name: "Unclustered Events",
            parentId: null,
            color: UNCLUSTERED_COLOR,
            icon: { type: "cluster", variant: "circle-dashed", color: UNCLUSTERED_COLOR },
            children: [],
            totalCount: unclusteredCount,
            isCatchAll: true,
          });
        }
        return mapped;
      }
      case "severity":
        return buildTree(buildSeverityNodes());
      case "enum":
        return buildTree(buildEnumNodes(breakdownBy.field, schemaField));
      case "agent":
        return buildTree(buildAgentNodes(agentBuckets));
    }
  }, [breakdownBy, clusterTree, unclusteredCount, schemaField, agentBuckets]);

  const statsData = useMemo<BreakdownStatsPoint[]>(() => {
    if (isClusters) {
      return clusterStatsData.map((p) => ({ bucketId: p.cluster_id, timestamp: p.timestamp, count: p.count }));
    }
    const items = statsResp?.items ?? [];
    return breakdownBy.kind === "agent" ? rollupAgentStats(items, agentBuckets) : items;
  }, [isClusters, clusterStatsData, statsResp, breakdownBy, agentBuckets]);

  const setSelectedId = useCallback(
    (id: string | null) => {
      if (isClusters) {
        // Picking anything in the cluster tree exits the emerging-cluster view.
        setEmergingClusterId(null);
        setClusterId(id);
      } else {
        setBreakdownSelectedId(id);
      }
    },
    [isClusters, setClusterId, setEmergingClusterId, setBreakdownSelectedId]
  );

  const selectedId = isClusters ? clusterId : breakdownSelectedId;

  const isLoading = isClusters ? isClustersLoading : breakdownBy.kind === "agent" ? agentBucketsLoading : false;
  const isStatsLoading = isClusters ? isClusterStatsLoading : statsLoading;

  return { nodes, statsData, selectedId, setSelectedId, isLoading, isStatsLoading };
}

// Re-export so callers get the dimension type from one place.
export type { BreakdownDimension };
