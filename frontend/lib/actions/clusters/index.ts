import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";

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

export const GetEventClustersSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
});

export async function getEventClusters(
  input: z.infer<typeof GetEventClustersSchema>
): Promise<{ items: EventCluster[] }> {
  const { projectId, signalId } = GetEventClustersSchema.parse(input);

  const result = await clickhouseClient.query({
    query: `
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
      WHERE project_id = {projectId: UUID}
        AND signal_id = {signalId: UUID}
        AND level != 0
      ORDER BY num_signal_events DESC, level ASC, created_at ASC
    `,
    query_params: {
      projectId,
      signalId,
    },
    format: "JSONEachRow",
  });

  const rows = (await result.json()) as Array<{
    id: string;
    name: string;
    parentId: string | null;
    level: string;
    numChildrenClusters: string;
    numEvents: string;
    createdAt: string;
    updatedAt: string;
  }>;

  const items: EventCluster[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    parentId: row.parentId || null,
    level: parseInt(String(row.level), 10),
    numChildrenClusters: parseInt(String(row.numChildrenClusters), 10),
    numEvents: parseInt(String(row.numEvents), 10),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));

  return { items };
}
