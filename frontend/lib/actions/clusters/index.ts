import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

export type EventCluster = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
  numChildrenClusters: number;
  numEvents: number;
  createdAt: string;
  updatedAt: string;
};

export const UNCLUSTERED_ID = "__unclustered__";

export const GetEventClustersSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
});

export async function getEventClusters(
  input: z.infer<typeof GetEventClustersSchema>
): Promise<{ items: EventCluster[]; totalEventCount: number; clusteredEventCount: number }> {
  const { projectId, signalId } = GetEventClustersSchema.parse(input);

  const clustersQuery = `
    SELECT
      id,
      name,
      parent_id as parentId,
      level,
      num_children_clusters as numChildrenClusters,
      num_signal_events as numEvents,
      formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt,
      formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') as updatedAt
    FROM clusters
    WHERE signal_id = {signalId: UUID}
      AND level != 0
    ORDER BY num_signal_events DESC, level ASC, created_at ASC
  `;

  const countQuery = `
    SELECT count() as count
    FROM signal_events
    WHERE signal_id = {signalId: UUID}
  `;

  const unclusteredCountQuery = `
    SELECT count() as count
    FROM signal_events
    WHERE signal_id = {signalId: UUID}
      AND empty(clusters)
  `;

  const [rows, countResult, unclusteredCountResult] = await Promise.all([
    executeQuery<{
      id: string;
      name: string;
      parentId: string | null;
      level: string;
      numChildrenClusters: string;
      numEvents: string;
      createdAt: string;
      updatedAt: string;
    }>({
      query: clustersQuery,
      parameters: { signalId },
      projectId,
    }),
    executeQuery<{ count: number }>({
      query: countQuery,
      parameters: { signalId },
      projectId,
    }),
    executeQuery<{ count: number }>({
      query: unclusteredCountQuery,
      parameters: { signalId },
      projectId,
    }),
  ]);

  const items: EventCluster[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId && row.parentId !== "00000000-0000-0000-0000-000000000000" ? row.parentId : null,
    level: parseInt(String(row.level), 10),
    numChildrenClusters: parseInt(String(row.numChildrenClusters), 10),
    numEvents: parseInt(String(row.numEvents), 10),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  const unclusteredEventCount = unclusteredCountResult[0]?.count || 0;
  const clusteredEventCount = (countResult[0]?.count || 0) - unclusteredEventCount;

  return { items, totalEventCount: countResult[0]?.count || 0, clusteredEventCount };
}
