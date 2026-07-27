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

/** Pick the finest named cluster (min level > 0 = L1 leaf) for one event. */
function pickLeafCluster(
  clusterIds: string[] | null,
  clusterMeta: Map<string, TraceSignalClusterNode>
): TraceSignalClusterNode | null {
  return (
    (clusterIds ?? [])
      .map((id) => clusterMeta.get(id))
      .filter((n): n is TraceSignalClusterNode => !!n)
      .sort((a, b) => a.level - b.level)[0] ?? null
  );
}

/**
 * Signals (with their events) that fired on a trace, for the trace-view panel.
 * Each event carries its own L1 (finest named) cluster; the signal-level leaf
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

  // The panel shows an L1 leaf cluster per event (one finding may cluster
  // differently from another), so gather cluster metadata for every event's
  // clusters to pick each one's finest named node.
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
  pastHours: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
});

const MAX_EVENTS_PER_SIGNAL = 5;

type BatchEventRow = {
  id: string;
  signalId: string;
  traceId: string;
  summary: string;
  name: string;
  // Window aggregates over ALL of the (trace, signal) pair's events — exact
  // even though LIMIT BY trims the returned rows.
  eventCount: string;
  maxSeverity: number;
};

/** Trace-table signal chips. Skips signal_events_v0 (its clusters join is project-wide). */
export async function getTraceRowSignals(
  input: z.infer<typeof GetTraceRowSignalsSchema>
): Promise<Map<string, TraceRowSignal[]>> {
  const { projectId, traceIds, pastHours, startDate, endDate } = GetTraceRowSignalsSchema.parse(input);

  const { timeClause, timeParams } = buildEventTimeClause({ pastHours, startDate, endDate });

  // Cap is per (trace, signal) so one multi-finding signal can't evict other
  // signals' chips; window aggregates are computed BEFORE the LIMIT BY trim,
  // so eventCount / maxSeverity stay exact past the cap.
  const eventsResult = await clickhouseClient.query({
    query: `
      SELECT
        id,
        signal_id as signalId,
        trace_id as traceId,
        summary,
        name,
        count() OVER (PARTITION BY trace_id, signal_id) as eventCount,
        max(severity) OVER (PARTITION BY trace_id, signal_id) as maxSeverity
      FROM signal_events
      WHERE project_id = {projectId: UUID}
        AND trace_id IN ({traceIds: Array(UUID)})
        ${timeClause}
      ORDER BY timestamp DESC
      LIMIT {maxEventsPerSignal: UInt32} BY trace_id, signal_id
    `,
    query_params: {
      projectId,
      traceIds,
      maxEventsPerSignal: MAX_EVENTS_PER_SIGNAL,
      ...timeParams,
    },
  });
  const events = (await eventsResult.json()).data as BatchEventRow[];
  if (events.length === 0) return new Map();

  const eventClusters = await fetchEventLeafClusters(
    projectId,
    events.map((e) => e.id)
  );

  const result = new Map<string, TraceRowSignal[]>();
  for (const e of events) {
    if (!e.name) continue;

    const traceSignals = result.get(e.traceId) ?? [];
    let chip = traceSignals.find((s) => s.signalId === e.signalId);
    if (!chip) {
      const leaf = eventClusters.get(e.id) ?? null;
      chip = {
        signalId: e.signalId,
        signalName: e.name,
        eventCount: Number(e.eventCount),
        maxSeverity: Number(e.maxSeverity),
        clusterId: leaf?.id ?? null,
        clusterName: leaf?.name ?? null,
        summaries: [],
      };
      traceSignals.push(chip);
      result.set(e.traceId, traceSignals);
    }
    if (e.summary) {
      chip.summaries.push(e.summary);
    }
  }

  return result;
}

function buildEventTimeClause(opts: { pastHours?: string; startDate?: string; endDate?: string }): {
  timeClause: string;
  timeParams: Record<string, string | number>;
} {
  const { pastHours, startDate, endDate } = opts;
  if (pastHours && !isNaN(parseFloat(pastHours))) {
    return {
      timeClause: "AND timestamp >= now() - INTERVAL {pastHours: UInt32} HOUR",
      timeParams: { pastHours: parseInt(pastHours) },
    };
  }
  if (startDate && endDate) {
    return {
      timeClause: `AND timestamp >= toDateTime64({startDate: String}, 9)
        AND timestamp <= toDateTime64({endDate: String}, 9)`,
      // toDateTime64 rejects the ISO Z suffix (CANNOT_PARSE_TEXT) — strip it,
      // same as the shared query-builder's time-range params.
      timeParams: { startDate: startDate.replace("Z", ""), endDate: endDate.replace("Z", "") },
    };
  }
  return { timeClause: "", timeParams: {} };
}

/** Deepest named cluster per event (level > 0). */
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
