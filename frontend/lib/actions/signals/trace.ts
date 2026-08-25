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

// Mirrored by a client-safe copy in components/traces/trace-view/store/base.ts;
// this module is server-only so its types can't be imported into client code.
export type TraceSignalEvent = EventRow & { leafClusters: TraceSignalClusterNode[] };

export type TraceSignal = {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  events: TraceSignalEvent[];
};

type SignalEventRow = EventRow & { clusters: string[] | null };

/** All finest named clusters (min level > 0) for one event. An event can belong to
 *  several clusters at that level; everything coarser in `clusters` is their
 *  ancestor chain, which the panel doesn't show. */
function pickLeafClusters(
  clusterIds: string[] | null,
  clusterMeta: Map<string, TraceSignalClusterNode>
): TraceSignalClusterNode[] {
  const nodes = (clusterIds ?? []).map((id) => clusterMeta.get(id)).filter((n): n is TraceSignalClusterNode => !!n);
  if (nodes.length === 0) return [];
  const minLevel = Math.min(...nodes.map((n) => n.level));
  // Name order keeps pills stable across requests — groupArray is unordered.
  return nodes.filter((n) => n.level === minLevel).sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Signals (with their events) that fired on a trace, for the trace-view panel.
 * Each event carries its own L1 (finest named) clusters — there is deliberately
 * no signal-level cluster, since one signal's events can land in unrelated ones.
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

  // The panel shows an event's L1 leaf clusters (one finding may cluster
  // differently from another), so gather cluster metadata for every event's
  // clusters to pick each one's finest named nodes.
  const allClusterIds = new Set<string>();
  for (const events of eventsBySignal.values()) {
    for (const e of events) {
      for (const cid of e.clusters ?? []) allClusterIds.add(cid);
    }
  }
  const clusterMeta: Map<string, TraceSignalClusterNode> =
    allClusterIds.size > 0 ? await fetchClusterNodes(projectId, [...allClusterIds]) : new Map();

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
    const mappedEvents: TraceSignalEvent[] = events.map((e) => ({
      id: e.id,
      signalId: e.signalId,
      traceId: e.traceId,
      payload: e.payload,
      timestamp: e.timestamp,
      severity: e.severity,
      leafClusters: pickLeafClusters(e.clusters, clusterMeta),
    }));
    return {
      signalId: signal.id,
      signalName: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema as Record<string, unknown>,
      events: mappedEvents,
    };
  });
}

async function fetchClusterNodes(
  projectId: string,
  clusterIds: string[]
): Promise<Map<string, TraceSignalClusterNode>> {
  const rows = await executeQuery<TraceSignalClusterNode>({
    projectId,
    query: `
      SELECT id, name, level
      FROM clusters
      WHERE id IN ({clusterIds: Array(UUID)})
        AND level != 0
    `,
    parameters: { clusterIds },
  });
  return new Map(rows.map((r) => [r.id, r]));
}
