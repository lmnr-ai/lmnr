import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { groupBy, mapValues, uniqBy } from "lodash";
import { z } from "zod/v4";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";

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
export type TraceSignalEvent = {
  id: string;
  signalId: string;
  traceId: string;
  payload: string;
  severity: number;
  leafClusters: TraceSignalClusterNode[];
};

export type TraceSignal = {
  signalId: string;
  signalName: string;
  prompt: string;
  structuredOutput: Record<string, unknown>;
  events: TraceSignalEvent[];
};

type TraceEventRow = {
  id: string;
  signalId: string;
  payload: string;
  severity: number;
};

type EventClusterRow = {
  eventId: string;
  clusterId: string;
  clusterName: string;
  level: number;
};

// Trace-keyed: `signal_events` is ordered (project_id, signal_id, …) and can't prune by trace.
const fetchTraceEvents = async (projectId: string, traceId: string): Promise<TraceEventRow[]> => {
  const rows = await executeQuery<TraceEventRow>({
    projectId,
    // Qualify `traces.id` — a bare `id` would match `e.event_id AS id`.
    query: `
      SELECT
        e.event_id AS id,
        e.signal_id AS signalId,
        e.payload AS payload,
        e.severity AS severity
      FROM traces
      ARRAY JOIN signal_events AS e
      WHERE traces.id = {traceId: UUID}
      ORDER BY e.severity DESC, e.event_id ASC
    `,
    parameters: { traceId },
  });
  return rows.map((r) => ({ ...r, severity: Number(r.severity) }));
};

// Per-event L1 memberships — `traces.clusters` is the trace-wide union and would mis-attribute.
const fetchLeafClusters = async (
  projectId: string,
  signalIds: string[],
  eventIds: string[]
): Promise<Record<string, TraceSignalClusterNode[]>> => {
  const rows = await executeQuery<EventClusterRow>({
    projectId,
    // `signal_id IN (…)` is the view's prune key; without it this scans every signal in the project.
    query: `
      SELECT
        event_id AS eventId,
        cluster_id AS clusterId,
        cluster_name AS clusterName,
        level
      FROM event_clusters_all
      WHERE signal_id IN ({signalIds: Array(UUID)})
        AND event_id IN ({eventIds: Array(UUID)})
        AND level = 1
    `,
    parameters: { signalIds, eventIds },
  });

  return mapValues(groupBy(rows, "eventId"), (eventRows) =>
    uniqBy(
      eventRows.filter((r) => r.clusterId),
      "clusterId"
    )
      .map((r) => ({ id: r.clusterId, name: r.clusterName, level: Number(r.level) }))
      // Memberships are unordered; name order keeps the pills stable.
      .sort((a, b) => a.name.localeCompare(b.name))
  );
};

// Per-event L1 clusters only — one signal's findings can land in unrelated clusters.
export async function getTraceSignals(input: z.infer<typeof GetTraceSignalsSchema>): Promise<TraceSignal[]> {
  const { projectId, traceId } = GetTraceSignalsSchema.parse(input);

  const eventRows = await fetchTraceEvents(projectId, traceId);
  if (eventRows.length === 0) return [];

  const eventsBySignal = groupBy(eventRows, "signalId");
  const signalIds = Object.keys(eventsBySignal);
  const [clustersByEvent, signalRows] = await Promise.all([
    fetchLeafClusters(
      projectId,
      signalIds,
      eventRows.map((e) => e.id)
    ),
    db
      .select({
        id: signals.id,
        name: signals.name,
        prompt: signals.prompt,
        structuredOutputSchema: signals.structuredOutputSchema,
      })
      .from(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, signalIds))),
  ]);

  // Map from Postgres: deleted-signal tuples stay on traces_agg and must not surface.
  return signalRows.map((signal) => ({
    signalId: signal.id,
    signalName: signal.name,
    prompt: signal.prompt,
    structuredOutput: signal.structuredOutputSchema as Record<string, unknown>,
    events: (eventsBySignal[signal.id] ?? []).map((e) => ({
      id: e.id,
      signalId: e.signalId,
      traceId,
      payload: e.payload,
      severity: e.severity,
      leafClusters: clustersByEvent[e.id] ?? [],
    })),
  }));
}
