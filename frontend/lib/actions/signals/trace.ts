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
  clusterPath: TraceSignalClusterNode[];
  events: EventRow[];
};

type SignalEventRow = EventRow & { clusters: string[] | null };

/**
 * Signals (with their events) that fired on a trace, for the trace-view panel.
 * Each signal carries a root→leaf cluster breadcrumb derived from its latest event.
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

  // The breadcrumb is shown once per signal, off its latest event — so we only
  // need cluster metadata for those clusters.
  const latestClusterIds = new Set<string>();
  for (const events of eventsBySignal.values()) {
    for (const cid of events[0].clusters ?? []) latestClusterIds.add(cid);
  }
  const clusterMeta: Map<string, TraceSignalClusterNode> =
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
    const clusterPath = (events[0]?.clusters ?? [])
      .map((id) => clusterMeta.get(id))
      .filter((n): n is TraceSignalClusterNode => !!n)
      // Higher level = closer to root; sort descending so the leaf lands last.
      .sort((a, b) => b.level - a.level);

    return {
      signalId: signal.id,
      signalName: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema as Record<string, unknown>,
      clusterPath,
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
    `,
    parameters: { clusterIds },
  });
  return new Map(rows.map((r) => [r.id, r]));
}
