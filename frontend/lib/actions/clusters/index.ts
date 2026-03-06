import { z } from "zod/v4";

import { buildSelectQuery, type QueryParams } from "@/lib/actions/common/query-builder";
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

export const GetEventClustersSchema = z.object({
  projectId: z.string(),
  signalId: z.string(),
});

export async function getEventClusters(
  input: z.infer<typeof GetEventClustersSchema>
): Promise<{ items: EventCluster[] }> {
  const { projectId, signalId } = GetEventClustersSchema.parse(input);

  const customConditions: Array<{ condition: string; params: QueryParams }> = [
    {
      condition: "signal_id = {signalId:UUID}",
      params: { signalId },
    },
    {
      condition: "level != 0",
      params: {},
    },
  ];

  const { query, parameters } = buildSelectQuery({
    select: {
      columns: [
        "id",
        "name",
        "parent_id as parentId",
        "level",
        "num_children_clusters as numChildrenClusters",
        "num_signal_events as numEvents",
        "formatDateTime(created_at, '%Y-%m-%dT%H:%i:%S.%fZ') as createdAt",
        "formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') as updatedAt",
      ],
      table: "clusters",
    },
    customConditions,
    orderBy: [
      { column: "num_signal_events", direction: "DESC" },
      { column: "level", direction: "ASC" },
      { column: "created_at", direction: "ASC" },
    ],
  });

  const items = await executeQuery<EventCluster>({ query, parameters, projectId });

  return { items };
}
