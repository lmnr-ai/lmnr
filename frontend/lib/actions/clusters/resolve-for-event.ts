import "server-only";

import { z } from "zod/v4";

import { clickhouseClient } from "@/lib/clickhouse/client";

export const ResolveClusterForEventSchema = z.object({
  projectId: z.guid(),
  signalId: z.guid(),
  eventId: z.guid(),
});

export type ResolvedCluster =
  | { kind: "cluster"; clusterId: string }
  | { kind: "emergingCluster"; emergingClusterId: string }
  | { kind: "none" };

/**
 * Given an event id, find the most specific cluster the event belongs to.
 *
 * Resolution order:
 *   1. The lowest non-L0 cluster (level >= 1) — the "normal" cluster view.
 *      If multiple exist (L1, L2, ... ancestors), we pick the deepest (min level > 0).
 *   2. Otherwise, the L0 cluster (level = 0) — the "emerging cluster" view.
 *   3. If the event has no cluster entries, returns { kind: "none" }.
 */
export async function resolveClusterForEvent(
  input: z.infer<typeof ResolveClusterForEventSchema>
): Promise<ResolvedCluster> {
  const { projectId, signalId, eventId } = ResolveClusterForEventSchema.parse(input);

  const query = `
    SELECT c.id AS id, c.level AS level
    FROM events_to_clusters AS e FINAL
    INNER JOIN signal_event_clusters AS c FINAL
      ON e.project_id = c.project_id AND e.cluster_id = c.id
    WHERE e.project_id = {projectId:UUID}
      AND e.event_id = {eventId:UUID}
      AND c.signal_id = {signalId:UUID}
    ORDER BY c.level ASC
  `;

  const result = await clickhouseClient.query({
    query,
    format: "JSONEachRow",
    query_params: { projectId, signalId, eventId },
  });

  const rows = (await result.json()) as Array<{ id: string; level: number }>;
  if (rows.length === 0) return { kind: "none" };

  const normalCluster = rows.find((r) => Number(r.level) > 0);
  if (normalCluster) {
    return { kind: "cluster", clusterId: normalCluster.id };
  }

  const l0 = rows.find((r) => Number(r.level) === 0);
  if (l0) {
    return { kind: "emergingCluster", emergingClusterId: l0.id };
  }

  return { kind: "none" };
}
