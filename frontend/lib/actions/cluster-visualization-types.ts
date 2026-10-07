import type { ClusterStatsDataPoint, EventCluster, TimeSeriesDataPoint } from "@/lib/actions/clusters";

export type ClusterVisualizationSnapshot = {
  rangeKey: string;
  clusters: EventCluster[];
  totalEventCount: number;
  clusteredEventCount: number;
  stats: ClusterStatsDataPoint[];
  unclusteredCounts: TimeSeriesDataPoint[];
  traceTotal: number;
};

export const getClusterVisualizationRangeKey = ({
  pastHours,
  startDate,
  endDate,
}: {
  pastHours?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}) => `${pastHours ?? ""}:${startDate ?? ""}:${endDate ?? ""}`;
