import "server-only";

import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { clickhouseClient } from "@/lib/clickhouse/client";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";
import { type EventRow } from "@/lib/events/types";
import { type TraceRowSignal } from "@/lib/traces/types";

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
export type TraceSignalEvent = EventRow & { leafCluster: TraceSignalClusterNode | null };

export type TraceSignal = {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  leafCluster: TraceSignalClusterNode | null;
  events: TraceSignalEvent[];
};

type SignalEventRow = EventRow & { clusters: string[] | null };

/** Pick the deepest (highest-level) named cluster for one event's cluster ids. */
function pickLeafCluster(
  clusterIds: string[] | null,
  clusterMeta: Map<string, TraceSignalClusterNode>
): TraceSignalClusterNode | null {
  return (
    (clusterIds ?? [])
      .map((id) => clusterMeta.get(id))
      .filter((n): n is TraceSignalClusterNode => !!n)
      .sort((a, b) => b.level - a.level)[0] ?? null
  );
}

/**
 * Signals (with their events) that fired on a trace, for the trace-view panel.
 * Each event carries its own deepest (leaf) cluster; the signal-level leaf
 * cluster (its latest event's) drives the panel accent color.
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

  // The panel shows a leaf cluster per event (one finding may cluster
  // differently from another), so gather cluster metadata for every event's
  // clusters to pick each one's deepest node.
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
      leafCluster: pickLeafCluster(e.clusters, clusterMeta),
    }));
    return {
      signalId: signal.id,
      signalName: signal.name,
      prompt: signal.prompt,
      structuredOutput: signal.structuredOutputSchema as Record<string, unknown>,
      leafCluster: mappedEvents[0]?.leafCluster ?? null,
      events: mappedEvents,
    };
  });
}

export const GetTraceRowSignalsSchema = z.object({
  projectId: z.guid(),
  traceIds: z.array(z.guid()).min(1),
});

const MAX_SUMMARIES_PER_SIGNAL = 5;
// Caps the events fetched per trace (LIMIT BY, so one noisy trace can't evict
// others). Chips built from the latest N events; eventCount saturates at this.
const MAX_EVENTS_PER_TRACE = 50;

type BatchEventRow = {
  id: string;
  signalId: string;
  traceId: string;
  severity: number;
  summary: string;
};

/**
 * Per-trace signal chips for the traces table, batched over one page of trace ids.
 *
 * Deliberately does NOT read signal_events_v0: its `clusters` column comes from a
 * project-wide events_to_clusters ⋈ signal_event_clusters join that runs even when
 * the column isn't selected. Instead three explicitly keyed reads, each pruning on
 * its table's primary key (events by trace_id set, links by event_id, clusters by id).
 */
export async function getTraceRowSignals(
  input: z.infer<typeof GetTraceRowSignalsSchema>
): Promise<Map<string, TraceRowSignal[]>> {
  const { projectId, traceIds } = GetTraceRowSignalsSchema.parse(input);

  const eventsResult = await clickhouseClient.query({
    query: `
      SELECT
        id,
        signal_id as signalId,
        trace_id as traceId,
        severity,
        summary
      FROM signal_events
      WHERE project_id = {projectId: UUID}
        AND trace_id IN ({traceIds: Array(UUID)})
      ORDER BY timestamp DESC
      LIMIT {maxEventsPerTrace: UInt32} BY trace_id
    `,
    query_params: { projectId, traceIds, maxEventsPerTrace: MAX_EVENTS_PER_TRACE },
  });
  const events = (await eventsResult.json()).data as BatchEventRow[];
  if (events.length === 0) return new Map();

  const [eventClusters, signalNames] = await Promise.all([
    fetchEventLeafClusters(
      projectId,
      events.map((e) => e.id)
    ),
    db
      .select({ id: signals.id, name: signals.name })
      .from(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, [...new Set(events.map((e) => e.signalId))])))
      .then((rows) => new Map(rows.map((r) => [r.id, r.name]))),
  ]);

  const result = new Map<string, TraceRowSignal[]>();
  // Events are timestamp-DESC, so the first event seen per (trace, signal) is the
  // latest — its leaf cluster becomes the chip's cluster.
  for (const e of events) {
    const signalName = signalNames.get(e.signalId);
    if (!signalName) continue;

    const traceSignals = result.get(e.traceId) ?? [];
    let chip = traceSignals.find((s) => s.signalId === e.signalId);
    if (!chip) {
      const leaf = eventClusters.get(e.id) ?? null;
      chip = {
        signalId: e.signalId,
        signalName,
        eventCount: 0,
        maxSeverity: e.severity,
        clusterId: leaf?.id ?? null,
        clusterName: leaf?.name ?? null,
        summaries: [],
      };
      traceSignals.push(chip);
      result.set(e.traceId, traceSignals);
    }
    chip.eventCount += 1;
    chip.maxSeverity = Math.max(chip.maxSeverity, e.severity);
    if (e.summary && chip.summaries.length < MAX_SUMMARIES_PER_SIGNAL) {
      chip.summaries.push(e.summary);
    }
  }

  return result;
}

/**
 * Resolve each event's deepest (highest-level) named cluster in one round-trip.
 * The join's left side is pruned by the page's event ids (verified via EXPLAIN) —
 * unlike signal_events_v0's project-wide clusters subquery.
 */
async function fetchEventLeafClusters(
  projectId: string,
  eventIds: string[]
): Promise<Map<string, TraceSignalClusterNode>> {
  const result = await clickhouseClient.query({
    query: `
      SELECT e.event_id AS eventId, c.id AS id, c.name AS name, c.level AS level
      FROM events_to_clusters e FINAL
      INNER JOIN signal_event_clusters c FINAL
        ON e.project_id = c.project_id AND e.cluster_id = c.id
      WHERE e.project_id = {projectId: UUID}
        AND e.event_id IN ({eventIds: Array(UUID)})
        AND c.project_id = {projectId: UUID}
        AND c.level > 0
    `,
    query_params: { projectId, eventIds },
  });
  const rows = (await result.json()).data as ({ eventId: string } & TraceSignalClusterNode)[];

  const leafByEvent = new Map<string, TraceSignalClusterNode>();
  for (const row of rows) {
    const cluster = { id: row.id, name: row.name, level: Number(row.level) };
    const current = leafByEvent.get(row.eventId);
    if (!current || cluster.level > current.level) {
      leafByEvent.set(row.eventId, cluster);
    }
  }
  return leafByEvent;
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
