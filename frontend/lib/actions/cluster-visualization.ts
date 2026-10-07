import type { z } from "zod/v4";

import {
  type ClusterVisualizationSnapshot,
  getClusterVisualizationRangeKey,
} from "@/lib/actions/cluster-visualization-types";
import { getClusterEventCounts, getEventClusters, GetClusterEventCountsSchema } from "@/lib/actions/clusters";
import { getSignalRunStats } from "@/lib/actions/signal-runs";

export const GetClusterVisualizationSchema = GetClusterEventCountsSchema;

export async function getClusterVisualization(
  input: z.infer<typeof GetClusterVisualizationSchema>
): Promise<ClusterVisualizationSnapshot> {
  const parsed = GetClusterVisualizationSchema.parse(input);
  const [clusters, stats, runStats] = await Promise.all([
    getEventClusters(parsed),
    getClusterEventCounts(parsed),
    getSignalRunStats({ ...parsed, filter: [] }),
  ]);

  return {
    rangeKey: getClusterVisualizationRangeKey(parsed),
    clusters: clusters.items,
    totalEventCount: clusters.totalEventCount,
    clusteredEventCount: clusters.clusteredEventCount,
    stats: stats.items,
    unclusteredCounts: stats.unclusteredCounts,
    traceTotal: runStats.items.reduce((sum, item) => sum + Number(item.count), 0),
  };
}
