import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";
import { type EventRow } from "@/lib/events/types";

export const GetTraceSignalsSchema = z.object({
  projectId: z.guid(),
  traceId: z.guid(),
});

export type TraceSignalClusterNode = {
  id: string;
  name: string;
  level: number;
};

export type TraceSignal = {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  leafClusters: TraceSignalClusterNode[];
  events: EventRow[];
};

type SignalEventRow = EventRow & { clusters: string[] | null };

type ClusterNodeWithParent = TraceSignalClusterNode & { parentId: string | null };

const ZERO_UUID = "00000000-0000-0000-0000-000000000000";

/**
 * A trace can hit several distinct failure types at once, so a signal can carry
 * more than one cluster. We surface one leaf (deepest) cluster per distinct
 * cluster *tree*: group the event's (level > 0) clusters by their top-most
 * ancestor reachable within the set, then keep the deepest node in each group.
 */
function deriveLeafClusters(clusterIds: string[], meta: Map<string, ClusterNodeWithParent>): TraceSignalClusterNode[] {
  const nodes = clusterIds.map((id) => meta.get(id)).filter((n): n is ClusterNodeWithParent => !!n);
  if (nodes.length === 0) return [];

  // Walk parent_id up through the available metadata to find each node's tree
  // root. L0 (emerging) parents aren't in `meta`, so an L1 cluster is its own
  // root — distinct L1 roots therefore correspond to distinct failure types.
  const rootOf = (node: ClusterNodeWithParent): string => {
    // `seen` only guards against an infinite loop on malformed data — the
    // cluster hierarchy is a parent_id tree and should never contain cycles.
    const seen = new Set<string>();
    let current = node;
    while (current.parentId && meta.has(current.parentId) && !seen.has(current.id)) {
      seen.add(current.id);
      current = meta.get(current.parentId)!;
    }
    return current.id;
  };

  const leafByRoot = new Map<string, ClusterNodeWithParent>();
  for (const node of nodes) {
    const root = rootOf(node);
    const existing = leafByRoot.get(root);
    if (!existing || node.level > existing.level) {
      leafByRoot.set(root, node);
    }
  }

  return [...leafByRoot.values()].sort((a, b) => b.level - a.level).map(({ id, name, level }) => ({ id, name, level }));
}

/**
 * Signals (with their events) that fired on a trace, for the trace-view panel.
 * Each signal carries the leaf cluster of every distinct cluster tree it hit,
 * derived from its latest event.
 */
export async function getTraceSignals(input: z.infer<typeof GetTraceSignalsSchema>): Promise<TraceSignal[]> {
  const { projectId, traceId } = GetTraceSignalsSchema.parse(input);

  // signal_events is rewritten to the project-scoped signal_events_v0 view, whose
  // `clusters` column already holds the event's (level > 0) ancestor chain.
  const eventRows = await executeQuery<SignalEventRow>({
    projectId,
    query: `
      SELECT
        id,
        signal_id as signalId,
        trace_id as traceId,
        payload,
        severity,
        formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp,
        clusters
      FROM signal_events
      WHERE trace_id = {traceId: UUID}
      ORDER BY timestamp DESC
    `,
    parameters: { traceId },
  });

  if (eventRows.length === 0) return [];

  // Group events by signal, preserving timestamp-DESC order so [0] is the latest.
  const eventsBySignal = new Map<string, SignalEventRow[]>();
  for (const e of eventRows) {
    const list = eventsBySignal.get(e.signalId) ?? [];
    list.push(e);
    eventsBySignal.set(e.signalId, list);
  }

  // The panel shows leaf clusters per signal, off its latest event — so we only
  // need cluster metadata for those clusters (incl. parent_id) to group by tree.
  const latestClusterIds = new Set<string>();
  for (const events of eventsBySignal.values()) {
    for (const cid of events[0].clusters ?? []) latestClusterIds.add(cid);
  }
  const clusterMeta: Map<string, ClusterNodeWithParent> =
    latestClusterIds.size > 0 ? await fetchClusterNodes(projectId, [...latestClusterIds]) : new Map();

  const signalIds = [...eventsBySignal.keys()];
  const signalRows = await db
    .select({
      id: signals.id,
      name: signals.name,
      prompt: signals.prompt,
      structuredOutputSchema: signals.structuredOutputSchema,
    })
    .from(signals)
    .where(and(eq(signals.projectId, projectId), inArray(signals.id, signalIds)));

  return signalRows.map((signal) => {
    const events = eventsBySignal.get(signal.id) ?? [];
    const leafClusters = deriveLeafClusters(events[0]?.clusters ?? [], clusterMeta);
    return {
      signalId: signal.id,
      signalName: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema as Record<string, unknown>,
      leafClusters,
      events: events.map((e) => ({
        id: e.id,
        signalId: e.signalId,
        traceId: e.traceId,
        payload: e.payload,
        timestamp: e.timestamp,
        severity: e.severity,
      })),
    };
  });
}

async function fetchClusterNodes(projectId: string, clusterIds: string[]): Promise<Map<string, ClusterNodeWithParent>> {
  const rows = await executeQuery<TraceSignalClusterNode & { parentId: string }>({
    projectId,
    query: `
      SELECT id, name, level, parent_id as parentId
      FROM clusters
      WHERE id IN ({clusterIds: Array(UUID)})
        AND level != 0
    `,
    parameters: { clusterIds },
  });
  return new Map(
    rows.map((r) => [
      r.id,
      { id: r.id, name: r.name, level: r.level, parentId: r.parentId === ZERO_UUID ? null : r.parentId },
    ])
  );
}
