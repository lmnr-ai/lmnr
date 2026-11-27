import "server-only";
import { and, eq } from "drizzle-orm";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { NotFoundError } from "@/lib/api/errors";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";
import { readSignalSettings, type SignalSettings } from "@/lib/signals/settings";

export const SignalScopeSchema = z.object({ projectId: z.guid(), signalId: z.guid() });
export const ClusterScopeSchema = SignalScopeSchema.extend({ clusterId: z.guid() });
export type ClusterScopeInput = z.infer<typeof ClusterScopeSchema>;

/** A cluster proven to be an L1 cluster of a signal in the project. */
export interface ClusterScope {
  projectId: string;
  signalId: string;
  clusterId: string;
  signal: { name: string; settings: SignalSettings };
  clusterName: string;
}

/**
 * Validates the ids and checks the signal is in the project and the cluster is one of its L1 clusters; 404 otherwise.
 * Every per-cluster read and write goes through here: state rows are keyed by cluster id alone, so an unchecked id
 * could read or block another signal's (or project's) cluster.
 */
export async function resolveClusterScope(input: ClusterScopeInput): Promise<ClusterScope> {
  const { projectId, signalId, clusterId } = ClusterScopeSchema.parse(input);
  const [[signal], [cluster]] = await Promise.all([
    db
      .select({ name: signals.name, metadata: signals.metadata })
      .from(signals)
      .where(and(eq(signals.id, signalId), eq(signals.projectId, projectId)))
      .limit(1),
    executeQuery<{ name: string }>({
      query: `SELECT name FROM clusters WHERE id = {clusterId: UUID} AND signal_id = {signalId: UUID} AND level = 1`,
      parameters: { clusterId, signalId },
      projectId,
    }),
  ]);
  if (!signal) throw new NotFoundError("Signal not found");
  if (!cluster) throw new NotFoundError("Cluster not found");
  return {
    projectId,
    signalId,
    clusterId,
    signal: { name: signal.name, settings: readSignalSettings(signal.metadata) },
    clusterName: cluster.name,
  };
}
