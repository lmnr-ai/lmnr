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

  // Sum events only from leaf clusters (no children) to avoid double-counting
  // Parent clusters' num_signal_events includes their children's events
  const clusteredCountQuery = `
    SELECT coalesce(sum(num_signal_events), 0) as count
    FROM clusters
    WHERE signal_id = {signalId: UUID}
      AND level != 0
      AND num_children_clusters = 0
  `;

  const [rows, countResult, clusteredCountResult] = await Promise.all([
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
    executeQuery<{ count: string }>({
      query: clusteredCountQuery,
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

  const clusteredEventCount = parseInt(String(clusteredCountResult[0]?.count ?? "0"), 10);

  return { items, totalEventCount: countResult[0]?.count || 0, clusteredEventCount };
}
