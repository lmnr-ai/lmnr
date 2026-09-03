import { groupBy, mapValues, uniqBy } from "lodash";

import { executeQuery } from "@/lib/actions/sql";

import { type SignalRunCluster } from "./types";

interface EventClusterRow {
  eventId: string;
  clusterId: string;
  clusterName: string;
  level: number;
  numChildrenClusters: number;
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

const toCluster = (row: EventClusterRow): SignalRunCluster => ({
  id: row.clusterId,
  name: row.clusterName,
  level: Number(row.level),
  numChildrenClusters: Number(row.numChildrenClusters),
});

// Named leaf clusters (always L1) per event id, read separately so the paginated runs query stays one row per run.
export const getClustersByEventIds = async ({
  projectId,
  signalId,
  eventIds,
}: {
  projectId: string;
  signalId: string;
  eventIds: string[];
}): Promise<Record<string, SignalRunCluster[]>> => {
  const ids = Array.from(new Set(eventIds.filter((id) => id && id !== NIL_UUID)));
  if (ids.length === 0) return {};

  const rows = await executeQuery<EventClusterRow>({
    query: `
      SELECT
        event_id AS eventId,
        cluster_id AS clusterId,
        cluster_name AS clusterName,
        level,
        num_children_clusters AS numChildrenClusters
      FROM event_clusters_all
      WHERE signal_id = {signalId:UUID}
        AND event_id IN ({eventIds:Array(UUID)})
        AND level = 1
    `,
    parameters: { signalId, eventIds: ids },
    projectId,
  });

  return mapValues(groupBy(rows, "eventId"), (eventRows) =>
    uniqBy(
      eventRows.filter((r) => r.clusterId),
      "clusterId"
    )
      .map(toCluster)
      .sort((a, b) => a.name.localeCompare(b.name))
  );
};
