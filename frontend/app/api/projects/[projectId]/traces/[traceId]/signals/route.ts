import { and, eq, inArray } from "drizzle-orm";
import { type NextRequest, NextResponse } from "next/server";

import { executeQuery } from "@/lib/actions/sql";
import { db } from "@/lib/db/drizzle";
import { signals } from "@/lib/db/migrations/schema";
import { type EventRow } from "@/lib/events/types";

type EventClustersRow = EventRow & { clusters: string[] | null };

type ClusterMetaRow = {
  id: string;
  name: string;
  parentId: string | null;
  level: number;
};

type ClusterNode = ClusterMetaRow;

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  try {
    // The frontend SQL endpoint rewrites `signal_events` to the project-scoped
    // `signal_events_v0` view, which has a `clusters` column populated via a
    // join against `events_to_clusters`. So we can read clusters directly here
    // without a separate query.
    const eventRows = await executeQuery<EventClustersRow>({
      projectId,
      query: `
        SELECT
          id,
          signal_id as signalId,
          trace_id as traceId,
          payload,
          formatDateTime(timestamp, '%Y-%m-%dT%H:%i:%S.%fZ') as timestamp,
          clusters
        FROM signal_events
        WHERE trace_id = {traceId: UUID}
        ORDER BY timestamp DESC
      `,
      parameters: { traceId },
    });

    if (eventRows.length === 0) {
      return NextResponse.json([]);
    }

    // Resolve cluster metadata (names, parent chain). Wrapped in try/catch so a
    // cluster-side error degrades gracefully instead of blanking the panel.
    let clusterMeta = new Map<string, ClusterNode>();
    try {
      const allClusterIds = new Set<string>();
      for (const e of eventRows) for (const cid of e.clusters ?? []) allClusterIds.add(cid);
      if (allClusterIds.size > 0) {
        clusterMeta = await fetchClustersWithAncestors(projectId, [...allClusterIds]);
      }
    } catch (err) {
      console.error("Error fetching cluster metadata for trace signals:", err);
    }

    // For an event, find the deepest cluster in the set — i.e. the one whose
    // id is NOT used as parent_id by any other cluster in the same set —
    // then walk up via parent_id to build the path from root to leaf.
    //
    // We don't sort by `level`: in this codebase higher level = bigger,
    // more aggregated cluster (closer to root), not deeper. The parent_id
    // chain is the unambiguous source of truth.
    const buildClusterPath = (eventClusterIds: string[] | null): ClusterNode[] => {
      if (!eventClusterIds?.length) return [];
      const known = eventClusterIds
        .map((id) => clusterMeta.get(id))
        .filter((n): n is ClusterNode => !!n && n.level > 0);
      if (known.length === 0) return [];

      const usedAsParent = new Set<string>();
      for (const c of known) if (c.parentId) usedAsParent.add(c.parentId);
      const leafCandidates = known.filter((c) => !usedAsParent.has(c.id));
      // If multiple unrelated branches, pick the one with the longest path.
      let bestPath: ClusterNode[] = [];
      for (const start of leafCandidates) {
        const path: ClusterNode[] = [];
        let cur: ClusterNode | undefined = start;
        const seen = new Set<string>();
        while (cur && !seen.has(cur.id)) {
          seen.add(cur.id);
          path.unshift(cur);
          cur = cur.parentId ? clusterMeta.get(cur.parentId) : undefined;
        }
        if (path.length > bestPath.length) bestPath = path;
      }
      return bestPath;
    };

    type EnrichedEvent = EventRow & { clusterPath: ClusterNode[] };
    const eventsBySignal = new Map<string, EnrichedEvent[]>();
    for (const e of eventRows) {
      const enriched: EnrichedEvent = {
        id: e.id,
        signalId: e.signalId,
        traceId: e.traceId,
        payload: e.payload,
        timestamp: e.timestamp,
        severity: e.severity,
        clusterPath: buildClusterPath(e.clusters),
      };
      const list = eventsBySignal.get(e.signalId) ?? [];
      list.push(enriched);
      eventsBySignal.set(e.signalId, list);
    }

    const signalIds = [...eventsBySignal.keys()];

    // TODO: re-add `color: signals.color` once migration 0085 is applied.
    const signalRows = await db
      .select({
        id: signals.id,
        name: signals.name,
        prompt: signals.prompt,
        structuredOutputSchema: signals.structuredOutputSchema,
      })
      .from(signals)
      .where(and(eq(signals.projectId, projectId), inArray(signals.id, signalIds)));

    const result = signalRows.map((signal) => {
      const events = eventsBySignal.get(signal.id) ?? [];
      const latest = events[0];
      return {
        signalId: signal.id,
        signalName: signal.name,
        prompt: signal.prompt,
        structuredOutput: signal.structuredOutputSchema,
        color: null,
        clusterPath: latest?.clusterPath ?? [],
        events,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching trace signals:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch trace signals" },
      { status: 500 }
    );
  }
}

async function fetchClustersWithAncestors(projectId: string, clusterIds: string[]): Promise<Map<string, ClusterNode>> {
  const out = new Map<string, ClusterNode>();
  let pending = new Set(clusterIds);

  while (pending.size > 0) {
    const ids = [...pending];
    pending = new Set();
    const rows = await executeQuery<ClusterMetaRow>({
      projectId,
      query: `
        SELECT id, name, parent_id as parentId, level
        FROM clusters
        WHERE id IN ({clusterIds: Array(UUID)})
      `,
      parameters: { clusterIds: ids },
    });
    for (const r of rows) {
      const node: ClusterNode = {
        id: r.id,
        name: r.name,
        parentId: r.parentId && r.parentId !== "00000000-0000-0000-0000-000000000000" ? r.parentId : null,
        level: r.level,
      };
      out.set(r.id, node);
      if (node.parentId && !out.has(node.parentId)) pending.add(node.parentId);
    }
  }
  return out;
}
