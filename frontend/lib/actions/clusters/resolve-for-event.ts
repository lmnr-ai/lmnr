import "server-only";

import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";

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
    SELECT cluster_id AS id, level
    FROM event_clusters_all
    WHERE event_id = {eventId:UUID}
      AND signal_id = {signalId:UUID}
    ORDER BY level ASC
  `;

  const rows = await executeQuery<{ id: string; level: number }>({
    query,
    parameters: { signalId, eventId },
    projectId,
  });

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
